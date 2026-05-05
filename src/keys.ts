import {BindingKey, CoreBindings, MetadataAccessor} from '@loopback/core';
import type {EventEmitter} from 'events';
import type {NatsConnection} from '@nats-io/nats-core';
import type {JetStreamClient} from '@nats-io/jetstream';
import type {NatsConnectorComponent} from './component';
import type {NatsConnectionRegistry} from './services/connection-registry.service';
import type {NatsPublisher} from './services/nats-publisher.service';
import type {
  Codec,
  NatsConnectorOptionsCanonical,
  SubscriptionMetadata,
} from './types';

/**
 * Binding keys exposed by `loopback-nats-connector`.
 *
 * Static keys (`COMPONENT`, `REGISTRY`, plus resolved-default aliases
 * `CONNECTION` / `CODEC` / `EVENTS` / `PUBLISHER` / `JETSTREAM`) are
 * the consumer-facing surface.
 *
 * Named-key factories build per-connection BindingKeys at runtime;
 * tags are applied where the binding is created (observer / registry).
 *
 * See: docs/plan/09-multi-connection.md.
 */
export namespace NatsConnectorComponentBindings {
  // ── component config ──────────────────────────────────────────────────────

  export const COMPONENT = BindingKey.create<NatsConnectorComponent>(
    `${CoreBindings.COMPONENTS}.NatsConnectorComponent`,
  );

  /** Internal — normalized canonical options stashed by component. */
  export const NORMALIZED_OPTIONS =
    BindingKey.create<NatsConnectorOptionsCanonical>('nats.normalizedOptions');

  // ── dynamic registry (v1.x) ───────────────────────────────────────────────

  export const REGISTRY =
    BindingKey.create<NatsConnectionRegistry>('nats.registry');

  // ── decorator metadata accessor ───────────────────────────────────────────

  export const SUBSCRIPTION_METADATA = MetadataAccessor.create<
    SubscriptionMetadata,
    MethodDecorator
  >('nats:subscription');

  // ── resolved-default aliases (unsuffixed) ─────────────────────────────────
  // Bound by ConnectionObserver to point at <resolved-default> connection's
  // per-name binding. See docs/plan/09-multi-connection.md §Default-connection resolution.

  export const CONNECTION = BindingKey.create<NatsConnection>(
    'nats.default.connection',
  );
  export const CODEC = BindingKey.create<Codec<unknown>>('nats.default.codec');
  export const EVENTS = BindingKey.create<EventEmitter>('nats.default.events');
  export const PUBLISHER = BindingKey.create<NatsPublisher>(
    'nats.default.publisher',
  );
  /** v2 — alias to default-resolved JetStream client. Bound iff that connection has `jetstream` configured. */
  export const JETSTREAM = BindingKey.create<JetStreamClient>(
    'nats.default.jetstream',
  );

  // ── named-key factories ───────────────────────────────────────────────────
  // Pattern: `nats.connections.<name>.<artifact>`. Tags applied at bind site
  // by ConnectionObserver / NatsConnectionRegistry: `{nats: '<artifact>', connection: '<name>'}`.

  export function connection(name: string): BindingKey<NatsConnection> {
    return BindingKey.create<NatsConnection>(
      `nats.connections.${name}.connection`,
    );
  }

  export function codec(name: string): BindingKey<Codec<unknown>> {
    return BindingKey.create<Codec<unknown>>(`nats.connections.${name}.codec`);
  }

  export function events(name: string): BindingKey<EventEmitter> {
    return BindingKey.create<EventEmitter>(`nats.connections.${name}.events`);
  }

  export function publisher(name: string): BindingKey<NatsPublisher> {
    return BindingKey.create<NatsPublisher>(
      `nats.connections.${name}.publisher`,
    );
  }

  /** v2 — JetStreamClient binding. Lazy. Bound only when the connection's `jetstream` block is set. */
  export function jetstream(name: string): BindingKey<JetStreamClient> {
    return BindingKey.create<JetStreamClient>(
      `nats.connections.${name}.jetstream`,
    );
  }
}

/** Tag values applied to per-connection bindings. Read by KV repo (v2) for mismatch check. */
export const NatsBindingTags = {
  /** Marker that the binding is part of the NATS extension. */
  NATS_ARTIFACT: 'nats',
  /** The connection name carried by the binding. */
  CONNECTION: 'connection',
} as const;
