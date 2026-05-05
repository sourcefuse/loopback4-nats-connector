/**
 * NatsConnectionRegistry — runtime per-tenant connection management.
 *
 * Contract:
 *   - add(name, opts)    open conn, bind per-name keys, fire onAdd handlers SEQUENTIALLY (handshake — closes race window)
 *   - remove(name)       fire onRemove handlers, drain conn, unbind keys
 *   - has / list         inspect current fleet
 *   - onAdd / onRemove   register handlers; returned Disposable removes them
 *
 * Handshake invariant: `add()` does NOT resolve until every onAdd
 * handler has completed. The booter's onAdd handler subscribes
 * templates against the new connection. Therefore: after
 * `await registry.add(name, opts)`, every `connection: '*'`
 * subscription is live on the new socket. See
 * docs/plan/11-dynamic-connections.md §Race window.
 *
 * See: docs/plan/05-internals.md §services/connection-registry.service.ts.
 */
import {
  Context,
  CoreBindings,
  LifeCycleObserver,
  inject,
  lifeCycleObserver,
} from '@loopback/core';
import {EventEmitter} from 'events';
import type {Application} from '@loopback/core';
import type {NatsConnection} from '@nats-io/nats-core';
import {
  bindConnectionForName,
  unbindConnectionForName,
} from '../observers/bind-connection';
import {
  buildConnectOptions,
  internals,
  wireStatusEvents,
} from '../observers/connection.observer';
import type {ConnectionOptions} from '../types';

export interface Disposable {
  dispose(): void;
}

export type RegistryHandler = (name: string) => void | Promise<void>;

interface OpenedEntry {
  conn: NatsConnection;
  events: EventEmitter;
}

@lifeCycleObserver('nats-subscriptions')
export class NatsConnectionRegistry implements LifeCycleObserver {
  private readonly conns = new Map<string, OpenedEntry>();
  private readonly addHandlers = new Set<RegistryHandler>();
  private readonly removeHandlers = new Set<RegistryHandler>();
  private controller = new AbortController();

  constructor(
    @inject(CoreBindings.APPLICATION_INSTANCE)
    private readonly app: Application,
  ) {}

  async start(): Promise<void> {
    // no-op — connections added dynamically via add()
  }

  /**
   * Open a new NATS connection and register it under `name`.
   *
   * Sequence:
   * 1. Connects via `internals.connect`.
   * 2. Binds `CONNECTION/CODEC/EVENTS/PUBLISHER/JETSTREAM` keys in LB4 context.
   * 3. Wires NATS status events into the per-connection `EventEmitter`.
   * 4. Fires every `onAdd` handler **sequentially and awaited** (handshake
   *    invariant — all subscriptions are live before the promise resolves).
   *
   * If any handler throws: connection drained + context bindings removed via
   * `AsyncDisposableStack`, error propagates. Connection committed to internal
   * map only after all handlers succeed.
   *
   * @param name - Unique identifier (e.g. tenant slug).
   * @param opts - Connection options forwarded to `buildConnectOptions`.
   * @throws {Error} If connection named `name` already exists.
   */
  async add(name: string, opts: ConnectionOptions): Promise<void> {
    if (this.conns.has(name)) {
      throw new Error(
        `NatsConnectionRegistry: connection '${name}' already exists`,
      );
    }

    const stack = new AsyncDisposableStack();
    try {
      const conn = await internals.connect(buildConnectOptions(opts, name));
      stack.defer(async () => {
        await conn.drain().catch(err => {
          // eslint-disable-next-line no-console
          console.error(`[nats] registry rollback drain '${name}' error`, err);
        });
      });

      const ctx: Context = this.app;
      const {events} = bindConnectionForName(ctx, name, conn, opts.jetstream);
      stack.defer(() => unbindConnectionForName(this.app, name));

      wireStatusEvents(conn, events, this.controller.signal);

      for (const h of this.addHandlers) {
        // eslint-disable-next-line no-await-in-loop
        await h(name);
      }

      stack.move(); // commit — deferred cleanups transferred, original is empty
      this.conns.set(name, {conn, events});
    } finally {
      await stack.disposeAsync();
    }
  }

  /**
   * Drain and unregister the connection identified by `name`.
   *
   * Idempotent — silently returns if `name` is not registered.
   *
   * Sequence:
   * 1. Fires every `onRemove` handler sequentially (errors swallowed + logged).
   * 2. Drains the NATS connection (errors swallowed + logged).
   * 3. Removes all listeners from the per-connection `EventEmitter`.
   * 4. Removes LB4 context bindings via `unbindConnectionForName`.
   * 5. Deletes the entry from the internal map.
   *
   * @param name - Identifier of the connection to remove.
   */
  async remove(name: string): Promise<void> {
    const entry = this.conns.get(name);
    if (!entry) return;

    // Fire onRemove FIRST so booter drains its handles before the
    // connection itself drains.
    for (const h of this.removeHandlers) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await h(name);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[nats] registry onRemove handler threw for '${name}':`,
          err,
        );
      }
    }

    try {
      await entry.conn.drain();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[nats] registry drain '${name}' error:`, err);
    }

    entry.events.removeAllListeners();
    unbindConnectionForName(this.app, name);
    this.conns.delete(name);
  }

  /**
   * Returns `true` if a connection with `name` is currently registered.
   *
   * @param name - Connection identifier to test.
   */
  has(name: string): boolean {
    return this.conns.has(name);
  }

  /**
   * Snapshot array of all currently registered connection names, in
   * insertion order.
   */
  list(): string[] {
    return [...this.conns.keys()];
  }

  /**
   * Register a handler called sequentially and awaited whenever a new
   * connection is added via {@link add}.
   *
   * Primary consumer: `SubscriptionBooter` registers `applyTemplatesTo(name)`
   * here so every `@subscribe({connection: '*'})` template binds to the new
   * connection before `add()` resolves.
   *
   * @param handler - Async or sync callback receiving the connection `name`.
   * @returns `Disposable` — call `dispose()` to unregister.
   * @see SubscriptionBooter.start in src/observers/subscription.observer.ts
   */
  onAdd(handler: RegistryHandler): Disposable {
    this.addHandlers.add(handler);
    return {dispose: () => this.addHandlers.delete(handler)};
  }

  /**
   * Register a handler called sequentially and awaited whenever a connection
   * is removed via {@link remove}.
   *
   * Handler fires **before** the connection is drained so subscribers can
   * close their handles cleanly. Handler errors are swallowed and logged.
   *
   * Primary consumer: `SubscriptionBooter` registers `drainTemplatesOf(name)`
   * here so all `@subscribe({connection: '*'})` subscriptions on the removed
   * connection are drained before the connection itself is drained.
   *
   * @param handler - Async or sync callback receiving the connection `name`.
   * @returns `Disposable` — call `dispose()` to unregister.
   * @see SubscriptionBooter.start in src/observers/subscription.observer.ts
   */
  onRemove(handler: RegistryHandler): Disposable {
    this.removeHandlers.add(handler);
    return {dispose: () => this.removeHandlers.delete(handler)};
  }

  /**
   * Abort status-event iteration, drain every registered connection via
   * {@link remove}, then reset the `AbortController` so the registry can
   * be restarted.
   *
   * Called automatically by LB4 via `@lifeCycleObserver`.
   */
  async stop(): Promise<void> {
    this.controller.abort();
    const names = [...this.conns.keys()];
    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      await this.remove(name);
    }
    this.controller = new AbortController();
  }
}
