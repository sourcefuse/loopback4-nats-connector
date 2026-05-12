/**
 * SubscriptionBooter — scans controller bindings at app start, reads
 * `SubscriptionMetadata` written by `@subscribe` / `@queueSubscribe` /
 * `@reply` / `@jsConsume` decorators, and creates the real NATS
 * subscriptions on the appropriate per-name connection.
 *
 * Two registration paths:
 *   - Static (`connection !== '*'`): subscriptions created immediately in `start()`.
 *   - Dynamic (`connection === '*'`): metadata stored as templates; subscriptions
 *     materialised via `onAdd` / `onRemove` hooks wired into `NatsConnectionRegistry`.
 *     The booter remains active for the full app lifetime — `registry.add('tenant')` at
 *     any point after `start()` triggers `applyTemplatesTo()` automatically.
 *
 * Drains all stored handles at app stop, before `ConnectionObserver`
 * drains the underlying sockets.
 *
 * Does NOT:
 *   - Open NATS connections (ConnectionObserver does).
 *   - Construct codec instances (ConnectionObserver binds them).
 *   - Inspect controller-side state — handlers are invoked via the
 *     LB4 context's controller resolution, so DI works.
 *
 * See:
 *   - docs/plan/05-internals.md  §observers/subscription.observer.ts
 *   - docs/plan/06-lifecycle.md  §Order of operations
 */
import {
  Application,
  Binding,
  CoreTags,
  CoreBindings,
  inject,
  lifeCycleObserver,
  LifeCycleObserver,
} from '@loopback/core';
import {MetadataInspector} from '@loopback/metadata';
import type {JetStreamClient, JsMsg} from '@nats-io/jetstream';
import type {Msg, NatsConnection} from '@nats-io/nats-core';
import {NatsConnectorComponentBindings as N} from '../keys';
import type {NatsConnectionRegistry} from '../services/connection-registry.service';
import type {
  Codec,
  JsConsumeOptions,
  JsContext,
  NatsConnectorOptionsCanonical,
  SubscriptionContext,
  SubscriptionMetadata,
} from '../types';

/** Common shape across core `Subscription` and `JetStreamSubscription`. */
interface DrainableSub {
  drain(): Promise<void>;
}

interface RegisteredHandle {
  connection: string;
  methodName: string;
  subject: string;
  sub: DrainableSub;
  /** True if this handle was created by a template (connection: '*'). */
  fromTemplate?: boolean;
}

interface Template {
  bindingKey: string;
  methodName: string;
  meta: SubscriptionMetadata;
}

@lifeCycleObserver('nats-subscriptions')
export class SubscriptionBooter implements LifeCycleObserver {
  private handles: RegisteredHandle[] = [];
  private inflight = new Set<Promise<void>>();
  private templates: Template[] = [];
  private addDispose?: {dispose(): void};
  private removeDispose?: {dispose(): void};

  constructor(
    @inject(CoreBindings.APPLICATION_INSTANCE)
    private readonly app: Application,
    @inject(N.NORMALIZED_OPTIONS, {optional: true})
    private readonly options?: NatsConnectorOptionsCanonical,
    @inject(N.REGISTRY, {optional: true})
    private readonly registry?: NatsConnectionRegistry,
  ) {}

  /**
   * Two-phase boot:
   *
   * Phase 1 — static registrations:
   *   Iterate all controller bindings; register subscriptions immediately
   *   for decorators where `connection !== '*'`.
   *
   * Phase 2 — dynamic hook installation:
   *   Decorators with `connection === '*'` are stored as templates.
   *   For connections already in the registry, `applyTemplatesTo()` runs now.
   *   Then `onAdd` / `onRemove` listeners are installed into `NatsConnectionRegistry`
   *   so any future `registry.add(name)` automatically materialises the
   *   templated subscriptions, and `registry.remove(name)` drains them.
   *   These listeners live until `stop()` calls `addDispose.dispose()` /
   *   `removeDispose.dispose()`.
   */
  async start(): Promise<void> {
    const controllerBindings = this.app.findByTag(CoreTags.CONTROLLER);

    for (const binding of controllerBindings) {
      // eslint-disable-next-line no-await-in-loop
      await this.processController(binding);
    }

    if (this.templates.length > 0 && this.registry) {
      // Apply templates to every connection currently in the registry,
      // and subscribe to add/remove for future tenants.
      for (const name of this.registry.list()) {
        // eslint-disable-next-line no-await-in-loop
        await this.applyTemplatesTo(name);
      }
      this.addDispose = this.registry.onAdd(name =>
        this.applyTemplatesTo(name),
      );
      this.removeDispose = this.registry.onRemove(name =>
        this.drainTemplatesOf(name),
      );
    }
  }

  private async processController(
    binding: Readonly<Binding<unknown>>,
  ): Promise<void> {
    const ctor = binding.valueConstructor;
    if (!ctor) return;

    const all = MetadataInspector.getAllMethodMetadata<SubscriptionMetadata>(
      N.SUBSCRIPTION_METADATA,
      ctor.prototype,
    );
    if (!all) return;

    for (const [methodName, meta] of Object.entries(all)) {
      if (!meta) continue;
      // eslint-disable-next-line no-await-in-loop
      await this.processMethod(binding.key, methodName, meta);
    }
  }

  private async processMethod(
    bindingKey: string,
    methodName: string,
    meta: SubscriptionMetadata,
  ): Promise<void> {
    const filled: SubscriptionMetadata = {...meta, methodName};
    if (filled.connection === '*') {
      this.templates.push({bindingKey, methodName, meta: filled});
      return;
    }
    await this.register(bindingKey, methodName, filled);
  }

  async stop(): Promise<void> {
    this.addDispose?.dispose();
    this.removeDispose?.dispose();
    this.addDispose = undefined;
    this.removeDispose = undefined;
    this.templates = [];
    await Promise.all(
      this.handles.map(async h => {
        try {
          await h.sub.drain();
        } catch {
          // Best-effort. ConnectionObserver.stop() drains the socket
          // afterwards, which cleans up any leaked subscriptions.
        }
      }),
    );
    await Promise.all(this.inflight);
    this.inflight.clear();
    this.handles = [];
  }

  // ─── dynamic / template helpers ────────────────────────────────────────

  private async applyTemplatesTo(name: string): Promise<void> {
    for (const tpl of this.templates) {
      const concrete: SubscriptionMetadata = {...tpl.meta, connection: name};
      // eslint-disable-next-line no-await-in-loop
      await this.register(tpl.bindingKey, tpl.methodName, concrete);
      const last = this.handles[this.handles.length - 1];
      if (last?.connection === name) last.fromTemplate = true;
    }
  }

  private async drainTemplatesOf(name: string): Promise<void> {
    const matching = this.handles.filter(
      h => h.fromTemplate && h.connection === name,
    );
    await Promise.all(
      matching.map(h =>
        h.sub.drain().catch(() => {
          /* best-effort */
        }),
      ),
    );
    this.handles = this.handles.filter(
      h => !(h.fromTemplate && h.connection === name),
    );
  }

  // ─── registration dispatch ─────────────────────────────────────────────

  private async register(
    bindingKey: string,
    methodName: string,
    meta: SubscriptionMetadata,
  ): Promise<void> {
    if (meta.connection === '*') return;

    const resolvedName = this.resolveConnectionName(meta);
    const codec = await this.app.get<Codec<unknown>>(N.codec(resolvedName));

    switch (meta.kind) {
      case 'subscribe':
      case 'reply': {
        const conn = await this.app.get<NatsConnection>(
          N.connection(resolvedName),
        );
        return this.registerCore(
          bindingKey,
          methodName,
          codec,
          meta,
          resolvedName,
          conn,
        );
      }
      case 'jsConsume':
        return this.registerJs(
          bindingKey,
          methodName,
          codec,
          meta,
          resolvedName,
        );
      default: {
        const exhaustive: never = meta.kind;
        throw new Error(
          `unknown SubscriptionMetadata.kind: ${String(exhaustive)}`,
        );
      }
    }
  }

  // ─── core (subscribe / reply) ──────────────────────────────────────────

  private registerCore(
    bindingKey: string,
    methodName: string,
    codec: Codec<unknown>,
    meta: SubscriptionMetadata,
    resolvedName: string,
    conn: NatsConnection,
  ): void {
    const isReply = meta.kind === 'reply';
    if (!meta.subject) {
      throw new Error(
        `[nats] subscription ${meta.connection}/${methodName}: subject is required for kind=${meta.kind}`,
      );
    }

    const sub = conn.subscribe(meta.subject, {
      queue: meta.queue,
      max: (meta.options as {maxMessages?: number}).maxMessages,
      timeout: (meta.options as {timeout?: number}).timeout,
      callback: (err, msg) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.error(
            `[nats] subscription ${meta.connection}/${meta.subject} error:`,
            err,
          );
          return;
        }
        const p = this.dispatchCore(
          bindingKey,
          methodName,
          codec,
          meta,
          resolvedName,
          msg,
          isReply,
        ).catch(dispatchErr => {
          // eslint-disable-next-line no-console
          console.error('[nats] unhandled dispatch error:', dispatchErr);
        });
        this.inflight.add(p);
        // eslint-disable-next-line no-void
        void p.finally(() => this.inflight.delete(p));
      },
    });

    this.handles.push({
      connection: resolvedName,
      methodName,
      subject: meta.subject,
      sub,
    });
  }

  private async dispatchCore(
    bindingKey: string,
    methodName: string,
    codec: Codec<unknown>,
    meta: SubscriptionMetadata,
    resolvedConnection: string,
    msg: Msg,
    isReply: boolean,
  ): Promise<void> {
    const controller = (await this.app.get(bindingKey)) as Record<
      string,
      (payload: unknown, ctx: SubscriptionContext) => unknown
    >;

    const ctx: SubscriptionContext = {
      subject: msg.subject,
      reply: msg.reply,
      headers: msg.headers,
      raw: msg.data,
      connection: resolvedConnection,
    };

    const payload = safeDecode(
      codec,
      msg.data,
      `subscription ${meta.connection}/${meta.subject}`,
    );

    let result: unknown;
    try {
      result = await controller[methodName](payload, ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[nats] handler ${meta.connection}/${methodName} threw:`,
        err,
      );
      return;
    }

    if (isReply && msg.reply) {
      try {
        msg.respond(codec.encode(result));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[nats] reply ${meta.connection}/${meta.subject} respond error:`,
          err,
        );
      }
    }
  }

  // ─── JetStream (jsConsume) ─────────────────────────────────────────────

  private async registerJs(
    bindingKey: string,
    methodName: string,
    codec: Codec<unknown>,
    meta: SubscriptionMetadata,
    resolvedName: string,
  ): Promise<void> {
    if (!meta.stream || !meta.consumer) {
      throw new Error(
        `[nats] @jsConsume ${meta.connection}/${methodName}: stream and consumer are required`,
      );
    }
    if (!this.app.contains(N.jetstream(resolvedName).key)) {
      throw new Error(
        `[nats] @jsConsume ${meta.stream}/${meta.consumer}: connection '${resolvedName}' has no jetstream configured`,
      );
    }
    const js = await this.app.get<JetStreamClient>(N.jetstream(resolvedName));
    const opts = meta.options as JsConsumeOptions;

    // Get the pre-existing durable consumer (created externally).
    // js.consumers.get() returns a Consumer (pull consumer) handle.
    const consumer = await js.consumers.get(meta.stream, meta.consumer);

    // Start consuming with a callback — non-blocking.
    // consume() returns Promise<ConsumerMessages>; ConsumerMessages exposes close().
    const messagesPromise = consumer.consume({
      callback: (msg: JsMsg) => {
        const p = this.dispatchJs(
          bindingKey,
          methodName,
          codec,
          meta,
          resolvedName,
          msg,
          opts,
        ).catch(dispatchErr => {
          // eslint-disable-next-line no-console
          console.error('[nats] unhandled dispatch error:', dispatchErr);
        });
        this.inflight.add(p);
        // eslint-disable-next-line no-void
        void p.finally(() => this.inflight.delete(p));
      },
    });

    // Wrap close() in a drain() adapter so RegisteredHandle.sub satisfies DrainableSub.
    const sub: DrainableSub = {
      drain: async () => {
        await (await messagesPromise).close();
      },
    };

    this.handles.push({
      connection: resolvedName,
      methodName,
      subject: `${meta.stream}/${meta.consumer}`,
      sub,
    });
  }

  private async dispatchJs(
    bindingKey: string,
    methodName: string,
    codec: Codec<unknown>,
    meta: SubscriptionMetadata,
    resolvedConnection: string,
    msg: JsMsg,
    opts: JsConsumeOptions,
  ): Promise<void> {
    const controller = (await this.app.get(bindingKey)) as Record<
      string,
      (payload: unknown, ctx: JsContext) => unknown
    >;
    const ctx = buildJsContext(msg, resolvedConnection);
    const payload = decodeJsPayload(codec, msg, meta);

    try {
      await controller[methodName](payload, ctx);
      if (opts.autoAck) msg.ack();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[nats] jsConsume ${meta.stream}/${methodName} threw:`,
        err,
      );
      if (opts.autoAck) msg.nak();
    }
  }

  // ─── connection name resolution ────────────────────────────────────────

  /**
   * Resolve the connection name in metadata to the binding-key name.
   * If the metadata says 'default' but no literal 'default' connection
   * exists AND the options have a `default: '<name>'` field, follow
   * the rule-1 alias. Throws when nothing resolves.
   */
  private resolveConnectionName(meta: SubscriptionMetadata): string {
    const requested = meta.connection;
    const opts = this.options;

    if (requested === 'default' && opts) {
      return this.resolveDefaultConnection(meta, opts);
    }

    this.assertConnectionDeclared(meta, requested, opts);
    return requested;
  }

  private resolveDefaultConnection(
    meta: SubscriptionMetadata,
    opts: NatsConnectorOptionsCanonical,
  ): string {
    if (opts.default && opts.connections[opts.default]) return opts.default;
    if ('default' in opts.connections) return 'default';
    throw new Error(
      `[nats] subscription on '${meta.subject ?? meta.stream}' targets the default connection but none resolves (no 'default' field, no literal 'default' connection)`,
    );
  }

  private assertConnectionDeclared(
    meta: SubscriptionMetadata,
    requested: string,
    opts: NatsConnectorOptionsCanonical | undefined,
  ): void {
    if (!opts) return;
    if (requested === 'default') return;
    if (requested in opts.connections) return;
    if (this.registry?.has(requested)) return;
    throw new Error(
      `[nats] subscription on '${meta.subject ?? meta.stream}' targets unknown connection '${requested}'`,
    );
  }
}

function buildJsContext(msg: JsMsg, resolvedConnection: string): JsContext {
  return {
    subject: msg.subject,
    reply: undefined,
    headers: msg.headers,
    raw: msg.data,
    connection: resolvedConnection,
    ack: async () => {
      msg.ack();
    },
    nak: async (delay?: number) => {
      msg.nak(delay);
    },
    term: async (reason?: string) => {
      msg.term(reason);
    },
    inProgress: async () => {
      msg.working();
    },
    meta: {
      stream: msg.info.stream,
      consumer: msg.info.consumer,
      streamSequence: msg.info.streamSequence,
      deliverySequence: msg.info.deliverySequence,
      deliveryCount: msg.info.deliveryCount,
      redelivered: msg.info.redelivered,
      pending: msg.info.pending,
    },
  };
}

function decodeJsPayload(
  codec: Codec<unknown>,
  msg: JsMsg,
  meta: SubscriptionMetadata,
): unknown {
  return safeDecode(
    codec,
    msg.data,
    `jsConsume ${meta.stream}/${meta.consumer}`,
  );
}

function safeDecode(
  codec: Codec<unknown>,
  data: Uint8Array,
  context: string,
): unknown {
  if (data.byteLength === 0) return undefined;
  try {
    return codec.decode(data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[nats] ${context} decode error:`, err);
    return undefined;
  }
}
