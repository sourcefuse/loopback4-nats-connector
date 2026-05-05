/**
 * Public + internal type schemas for `loopback-nats-connector`.
 *
 * Consumers import from the package root: `import type { ... } from 'loopback-nats-connector';`
 *
 * See:
 *   - docs/plan/04-public-api.md — public surface contract
 *   - docs/plan/05-internals.md  — internal types (SubscriptionMetadata)
 */
import type {BindingAddress} from '@loopback/core';
import type {MsgHdrs} from '@nats-io/nats-core';

// ─────────────────────────────────────────────────────────────────────────────
// Component options
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectionOptions {
  /** NATS URLs, e.g. ['nats://broker:4222']. Forwarded as `servers` to `connect()` from `@nats-io/transport-node`. */
  servers: string[];

  /** Authentication. Pick exactly one. Maps to `@nats-io/transport-node` connect-options fields. */
  auth?: AuthOptions;

  /** Connection name reported to the broker. Defaults to the map key. */
  name?: string;

  /** JetStream domain or API prefix. Omit to disable JetStream for this connection. (v2) */
  jetstream?: JetStreamOptions;

  /** Reconnect / health tuning — forwarded verbatim to `connect()` from `@nats-io/transport-node`. */
  reconnect?: ReconnectOptions;
}

export type AuthOptions =
  | {token: string}
  | {user: string; pass: string}
  | {tls: TlsOptions}
  | {nkey: {seed: string | Uint8Array}}
  | {jwt: {jwt: string; seed: string | Uint8Array}};

export interface TlsOptions {
  certFile?: string;
  keyFile?: string;
  caFile?: string;
  /** PEM contents. Buffer accepted; converted to UTF-8 string when forwarded. */
  cert?: string | Buffer;
  /** PEM contents. Buffer accepted. */
  key?: string | Buffer;
  /** PEM contents. Buffer accepted. */
  ca?: string | Buffer;
  /** `@nats-io/transport-node` requires `handshakeFirst: true` on the broker side. */
  handshakeFirst?: boolean;
}

export interface JetStreamOptions {
  domain?: string;
  apiPrefix?: string;
  timeout?: number;
}

export interface ReconnectOptions {
  maxReconnectAttempts?: number;
  reconnectTimeWait?: number;
  reconnectJitter?: number;
  reconnectJitterTLS?: number;
  waitOnFirstConnect?: boolean;
  pingInterval?: number;
  maxPingOut?: number;
  timeout?: number;
  noRandomize?: boolean;
  noEcho?: boolean;
}

/**
 * Canonical (post-normalize) component options. Always has `connections`
 * and a resolved-default name lookup behaviour.
 */
export interface NatsConnectorOptionsCanonical {
  connections: Record<string, ConnectionOptions>;
  /** Which named connection acts as the "default". See docs/plan/09-multi-connection.md. */
  default?: string;
}

/**
 * What consumers may pass to `configure(NatsConnectorComponentBindings.COMPONENT).to(...)`.
 * Either canonical (multi-connection) or flat (single-connection shorthand —
 * just `ConnectionOptions`). Component normalises at boot.
 */
export type NatsConnectorComponentOptions =
  | NatsConnectorOptionsCanonical
  | ConnectionOptions;

export const DEFAULT_NATS_CONNECTOR_OPTIONS: NatsConnectorComponentOptions = {
  connections: {
    default: {servers: ['nats://localhost:4222']},
  },
};

/** Back-compat alias for the original generator name. */
export const DEFAULT_LOOPBACK_NATS_CONNECTOR_OPTIONS =
  DEFAULT_NATS_CONNECTOR_OPTIONS;

// ─────────────────────────────────────────────────────────────────────────────
// Codec
// ─────────────────────────────────────────────────────────────────────────────

export interface Codec<T> {
  encode(value: T): Uint8Array;
  decode(bytes: Uint8Array): T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decorator option types (public)
// ─────────────────────────────────────────────────────────────────────────────

export interface SubscribeOptions {
  /** Default `'default'`. `'*'` = every registered connection (v1.x dynamic). */
  connection?: string;
  /** Promote to queue subscription — forwarded as `@nats-io/transport-node` `queue`. */
  queue?: string;
  /** Auto-drain after N messages — forwarded as `@nats-io/transport-node` `max`. */
  maxMessages?: number;
  /** ms; if no message in window, sub errors. Forwarded as `@nats-io/transport-node` `timeout`. */
  timeout?: number;
  /** Pending-message threshold for `slowConsumer` event. Forwarded as `@nats-io/transport-node` `slow`. */
  slow?: number;
}

export interface ReplyOptions {
  connection?: string;
  /** Load-balanced reply group. */
  queue?: string;
}

/** v2 — full surface deferred until JetStream impl. */
export interface JsConsumeOptions {
  connection?: string;
  ackPolicy?: 'none' | 'all' | 'explicit';
  autoAck?: boolean;
  deliverPolicy?:
    | 'all'
    | 'last'
    | 'new'
    | 'byStartSequence'
    | 'byStartTime'
    | 'lastPerSubject';
  optStartSeq?: number;
  optStartTime?: string;
  filterSubject?: string;
  filterSubjects?: string[];
  maxDeliver?: number;
  ackWait?: number;
  maxAckPending?: number;
  replayPolicy?: 'instant' | 'original';
  backoff?: number[];
  inactiveThreshold?: number;
  headersOnly?: boolean;
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Publisher option types (public)
// ─────────────────────────────────────────────────────────────────────────────

export interface PublishOptions {
  /** `MsgHdrs` from `@nats-io/nats-core` — construct via re-exported `headers()` factory. Forwarded verbatim. */
  headers?: MsgHdrs;
  /** Explicit reply subject. Forwarded as publish `reply` to `@nats-io/transport-node`. */
  reply?: string;
}

export interface RequestOptions extends PublishOptions {
  /** ms. Default 5_000 (extension default). Forwarded as request `timeout` to `@nats-io/transport-node`. */
  timeout?: number;
  /** When true plus `reply`, uses dedicated subscription. Forwarded as `noMux` to `@nats-io/transport-node`. */
  noMux?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler context (public, second arg to subscribe/reply handlers)
// ─────────────────────────────────────────────────────────────────────────────

export interface SubscriptionContext {
  /** Resolved subject (with wildcards filled in). */
  subject: string;
  /** Present when caller used request(). */
  reply?: string;
  /** `MsgHdrs` from `@nats-io/nats-core` — re-exported from package root. */
  headers?: MsgHdrs;
  /** Pre-decode bytes, in case the codec failed. */
  raw: Uint8Array;
  /** Name of the connection that delivered this message. */
  connection: string;
}

/**
 * v2 — JetStream consumer message context. Mirrors fields from `@nats-io/jetstream`
 * `JsMsg.info` (`DeliveryInfo`) — sequences are JS `number` (broker keeps
 * them as int64; values fit safely below `Number.MAX_SAFE_INTEGER` for
 * any realistic stream size).
 */
export interface JsContext extends SubscriptionContext {
  ack(): Promise<void>;
  nak(delay?: number): Promise<void>;
  term(reason?: string): Promise<void>;
  inProgress(): Promise<void>;
  meta: {
    stream: string;
    consumer: string;
    streamSequence: number;
    deliverySequence: number;
    /** Number of times this message has been delivered. `deliveryCount` from `@nats-io/jetstream`. */
    deliveryCount: number;
    redelivered: boolean;
    /** Pending messages on the consumer at delivery time. */
    pending: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionMetadata — internal contract decorator → booter
// ─────────────────────────────────────────────────────────────────────────────

export type SubscriptionKind = 'subscribe' | 'reply' | 'jsConsume';

export interface SubscriptionMetadata {
  kind: SubscriptionKind;
  /** subscribe + reply */
  subject?: string;
  /** jsConsume */
  stream?: string;
  /** jsConsume — durable name */
  consumer?: string;
  /** Promotes core subscribe to queue subscribe. */
  queue?: string;
  /** Connection name. Decorator fills `'default'` when caller omits. `'*'` = template. */
  connection: string;
  /** Original option object passed to the decorator. */
  options: SubscribeOptions | ReplyOptions | JsConsumeOptions;
  /** Method name on the controller class. Diagnostics + booter dispatch. */
  methodName: string;
  /** Reserved for v2: per-subject codec override binding address. */
  codec?: BindingAddress;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status events (public — emitted on NATS.EVENTS.<name>)
// ─────────────────────────────────────────────────────────────────────────────

export type StatusEventName =
  | 'disconnect'
  | 'reconnect'
  | 'reconnecting'
  | 'slowConsumer'
  | 'error'
  | 'update'
  | 'ldm'
  | 'staleConnection'
  | 'pingTimer';

export interface StatusEventPayloads {
  disconnect: {server: string};
  reconnect: {server: string};
  reconnecting: {server: string; attempt?: number};
  slowConsumer: {subject: string; pending: number};
  error: Error;
  update: {servers: string[]; added: string[]; deleted: string[]};
  ldm: {server: string};
  staleConnection: {server: string};
  pingTimer: {interval: number};
}
