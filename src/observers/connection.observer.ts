/**
 * ConnectionObserver — opens every named NATS connection at app start
 * and drains them at app stop. Owns the connection lifecycle for the
 * static (options-driven) fleet. Per-tenant dynamic connections use
 * `NatsConnectionRegistry` (v1.x — see services/connection-registry.service.ts).
 *
 * Responsibilities:
 *   - Open each `connections[name]` in parallel.
 *   - Bind per-name keys (CONNECTION / CODEC / EVENTS / PUBLISHER) with tags.
 *   - Wire `@nats-io/transport-node` status iterator into the per-name EventEmitter.
 *   - Alias the resolved-default name at unsuffixed keys.
 *   - Drain all connections on stop.
 *
 * Does NOT:
 *   - Read decorator metadata (booter does that).
 *   - Subscribe / publish.
 *   - Construct JetStream client (v2 lazy provider).
 *
 * See:
 *   - docs/plan/05-internals.md  §observers/connection.observer.ts
 *   - docs/plan/06-lifecycle.md  §Order of operations
 *   - docs/plan/09-multi-connection.md §Default-connection resolution
 */
import {
  Context,
  CoreBindings,
  Application,
  inject,
  lifeCycleObserver,
  LifeCycleObserver,
} from '@loopback/core';
import {EventEmitter, addAbortListener} from 'node:events';
import {connect} from '@nats-io/transport-node';
import {nkeyAuthenticator, jwtAuthenticator} from '@nats-io/nats-core';
import type {
  ConnectionOptions as NatsConnectOpts,
  NatsConnection,
  Status,
  TlsOptions as NatsTlsOptions,
} from '@nats-io/nats-core';

/**
 * Indirection point for tests. Sinon cannot stub the readonly getter on
 * the `nats` module export, so we wrap the calls here. Tests stub
 * `internals.connect` / `internals.nkeyAuthenticator` / `internals.jwtAuthenticator`.
 */
export const internals = {
  connect: (opts: NatsConnectOpts): Promise<NatsConnection> =>
    connect(opts as Parameters<typeof connect>[0]),
  nkeyAuthenticator: (seed: Uint8Array) => nkeyAuthenticator(seed),
  jwtAuthenticator: (jwt: string, seed: Uint8Array) =>
    jwtAuthenticator(jwt, seed),
};
import {NatsConnectorComponentBindings as N} from '../keys';
import {
  bindConnectionForName,
  unbindConnectionForName,
} from './bind-connection';
import type {
  ConnectionOptions,
  NatsConnectorOptionsCanonical,
  TlsOptions,
} from '../types';

interface OpenedConnection {
  name: string;
  conn: NatsConnection;
  events: EventEmitter;
}

@lifeCycleObserver('nats')
export class ConnectionObserver implements LifeCycleObserver {
  private opened: OpenedConnection[] = [];
  private controller = new AbortController();

  constructor(
    @inject(CoreBindings.APPLICATION_INSTANCE)
    private readonly app: Application,
    @inject(N.NORMALIZED_OPTIONS)
    private readonly options: NatsConnectorOptionsCanonical,
  ) {}

  async start(): Promise<void> {
    const entries = Object.entries(this.options.connections);

    // Open all connections in parallel. One failure does NOT abort others.
    const results = await Promise.allSettled(
      entries.map(async ([name, opts]) => this.openOne(name, opts)),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const [name] = entries[i];
      if (r.status === 'fulfilled') {
        this.opened.push(r.value);
      } else {
        // Failure-isolated startup. Log via console; subscriptions targeting
        // this name will fail loudly during the booter pass.
        // eslint-disable-next-line no-console
        console.error(`[nats] connection '${name}' failed to open:`, r.reason);
      }
    }

    this.aliasResolvedDefault();
  }

  async stop(): Promise<void> {
    this.controller.abort();
    const drains = this.opened.map(async ({conn, name}) => {
      try {
        await conn.drain();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[nats] connection '${name}' drain error:`, err);
      }
      unbindConnectionForName(this.app, name);
    });
    await Promise.all(drains);
    this.opened = [];
    this.controller = new AbortController();
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private async openOne(
    name: string,
    opts: ConnectionOptions,
  ): Promise<OpenedConnection> {
    const conn = await internals.connect(buildConnectOptions(opts, name));
    const ctx: Context = this.app;
    const {events} = bindConnectionForName(ctx, name, conn, opts.jetstream);
    wireStatusEvents(conn, events, this.controller.signal);
    return {name, conn, events};
  }

  /**
   * Resolve the default name per docs/plan/09 rules:
   *   1. options.default field
   *   2. literal name 'default' in connections
   *   3. neither → leave unsuffixed aliases unbound (consumers'
   *      `@inject(N.PUBLISHER)` rejects loudly at boot)
   */
  private aliasResolvedDefault(): void {
    const resolved = this.pickDefaultConnectionName();
    if (!resolved) return;
    if (!this.opened.some(o => o.name === resolved)) return;

    this.bindDefaultAliases(resolved);
  }

  private pickDefaultConnectionName(): string | undefined {
    const explicit = this.options.default;
    if (explicit && this.options.connections[explicit]) return explicit;
    if ('default' in this.options.connections) return 'default';
    return undefined;
  }

  private bindDefaultAliases(resolved: string): void {
    const ctx: Context = this.app;
    // Bind unsuffixed aliases. Use BindingScope.TRANSIENT so they always
    // re-resolve from the per-name binding (cheap; still singletons there).
    ctx.bind(N.CONNECTION).toAlias(N.connection(resolved));
    ctx.bind(N.CODEC).toAlias(N.codec(resolved));
    ctx.bind(N.EVENTS).toAlias(N.events(resolved));
    ctx.bind(N.PUBLISHER).toAlias(N.publisher(resolved));
    // Alias JETSTREAM only if the default connection has jetstream configured.
    if (this.options.connections[resolved]?.jetstream !== undefined) {
      ctx.bind(N.JETSTREAM).toAlias(N.jetstream(resolved));
    }
  }
}

// ─── shared helpers (also used by NatsConnectionRegistry in P3) ────────────

type AuthMapper = (
  auth: NonNullable<ConnectionOptions['auth']>,
) => Partial<NatsConnectOpts>;

const AUTH_MAPPERS: Array<{
  match: (a: NonNullable<ConnectionOptions['auth']>) => boolean;
  map: AuthMapper;
}> = [
  {
    match: a => 'token' in a,
    map: a => ({token: (a as {token: string}).token}),
  },
  {
    match: a => 'user' in a,
    map: a => {
      const u = a as {user: string; pass: string};
      return {user: u.user, pass: u.pass};
    },
  },
  {
    match: a => 'tls' in a,
    map: a => ({tls: mapTls((a as {tls: TlsOptions}).tls)}),
  },
  {
    match: a => 'nkey' in a,
    map: a => ({
      authenticator: internals.nkeyAuthenticator(
        toBytes((a as {nkey: {seed: string | Uint8Array}}).nkey.seed),
      ),
    }),
  },
  {
    match: a => 'jwt' in a,
    map: a => {
      const j = (a as {jwt: {jwt: string; seed: string | Uint8Array}}).jwt;
      return {
        authenticator: internals.jwtAuthenticator(j.jwt, toBytes(j.seed)),
      };
    },
  },
];

function applyAuth(
  out: NatsConnectOpts,
  auth: NonNullable<ConnectionOptions['auth']>,
): void {
  const mapper = AUTH_MAPPERS.find(m => m.match(auth));
  if (mapper) Object.assign(out, mapper.map(auth));
}

export function buildConnectOptions(
  opts: ConnectionOptions,
  name: string,
): NatsConnectOpts {
  const out: NatsConnectOpts = {
    servers: opts.servers,
    name: opts.name ?? name,
  };

  if (opts.auth) applyAuth(out, opts.auth);
  if (opts.reconnect) Object.assign(out, opts.reconnect);

  return out;
}

function toBytes(seed: string | Uint8Array): Uint8Array {
  return typeof seed === 'string' ? new TextEncoder().encode(seed) : seed;
}

const TLS_PASSTHROUGH_KEYS = [
  'certFile',
  'keyFile',
  'caFile',
  'handshakeFirst',
] as const;
const TLS_PEM_KEYS = ['cert', 'key', 'ca'] as const;

function mapTls(tls: TlsOptions): NatsTlsOptions {
  const out: NatsTlsOptions = {};
  for (const k of TLS_PASSTHROUGH_KEYS) {
    if (tls[k] !== undefined) (out as Record<string, unknown>)[k] = tls[k];
  }
  for (const k of TLS_PEM_KEYS) {
    const v = tls[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = bufToPem(v);
  }
  return out;
}

function bufToPem(value: string | Buffer): string {
  return typeof value === 'string' ? value : value.toString('utf8');
}
type StatusDataExtractor = (status: Status) => unknown;

const STATUS_DATA_EXTRACTORS: Record<string, StatusDataExtractor> = {
  disconnect: status => (status as {server: string}).server,
  reconnect: status => (status as {server: string}).server,
  ldm: status => (status as {server: string}).server,
  update: status => ({
    added: (status as {added?: string[]}).added,
    deleted: (status as {deleted?: string[]}).deleted,
  }),
  error: status => (status as {error: Error}).error.message,
  ping: status => (status as {pendingPings: number}).pendingPings,
};

function extractStatusData(status: Status): unknown {
  const extractor = STATUS_DATA_EXTRACTORS[status.type];
  return extractor ? extractor(status) : undefined;
}

/**
 * Subscribe to `conn.status()` and re-emit on the per-connection EventEmitter.
 * Cleans up all listeners when `signal` aborts (covers listener accumulation on restart).
 */
export function wireStatusEvents(
  conn: NatsConnection,
  emitter: EventEmitter,
  signal: AbortSignal,
): void {
  emitter.on('error', () => {
    /* swallowed — caller may attach their own listener for visibility */
  });

  addAbortListener(signal, () => {
    emitter.removeAllListeners();
  });

  // eslint-disable-next-line no-void
  void (async () => {
    try {
      for await (const status of conn.status() as AsyncIterable<Status>) {
        if (signal.aborted) break;
        emitter.emit(status.type, extractStatusData(status));
      }
    } catch (err) {
      if (!signal.aborted) emitter.emit('error', err);
    }
  })();
}
