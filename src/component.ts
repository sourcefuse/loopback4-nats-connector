/**
 * NatsConnectorComponent — the consumer-facing entry point.
 *
 * Responsibilities:
 *   1. Read user options via `@config()`.
 *   2. Normalize flat shorthand → canonical `{connections, default?}` form.
 *   3. Stash normalized config under `NATS.NORMALIZED_OPTIONS` for downstream artefacts.
 *   4. Register `lifeCycleObservers = [ConnectionObserver]` (booter joins in P1.D).
 *   5. Register `services = [NatsConnectionRegistry]` placeholder (full impl in P3).
 *
 * Does NOT open connections — ConnectionObserver does.
 *
 * See:
 *   - docs/plan/05-internals.md  §component.ts
 *   - docs/plan/09-multi-connection.md §Default-connection resolution
 */
import {
  Application,
  Component,
  BindingScope,
  Constructor,
  ContextTags,
  CoreBindings,
  LifeCycleObserver,
  ServiceOrProviderClass,
  config,
  inject,
  injectable,
} from '@loopback/core';
import {ConnectionObserver} from './observers/connection.observer';
import {SubscriptionBooter} from './observers/subscription.observer';
import {NatsConnectorComponentBindings} from './keys';
import {NatsConnectionRegistry} from './services/connection-registry.service';
import type {
  ConnectionOptions,
  NatsConnectorComponentOptions,
  NatsConnectorOptionsCanonical,
} from './types';
import {DEFAULT_NATS_CONNECTOR_OPTIONS} from './types';

@injectable({
  tags: {[ContextTags.KEY]: NatsConnectorComponentBindings.COMPONENT},
})
export class NatsConnectorComponent implements Component {
  readonly lifeCycleObservers: Constructor<LifeCycleObserver>[] = [
    ConnectionObserver,
    SubscriptionBooter,
    NatsConnectionRegistry,
  ];

  readonly services: ServiceOrProviderClass[] = [];

  readonly bindings = [
    // Alias the auto-bound service class under our public REGISTRY key
    // so consumers can `@inject(NatsConnectorComponentBindings.REGISTRY)`.
  ];

  constructor(
    @inject(CoreBindings.APPLICATION_INSTANCE)
    private application: Application,
    @config()
    private options: NatsConnectorComponentOptions = DEFAULT_NATS_CONNECTOR_OPTIONS,
  ) {
    const canonical = normalizeOptions(this.options);
    this.application
      .bind(NatsConnectorComponentBindings.NORMALIZED_OPTIONS)
      .to(canonical);

    // Alias REGISTRY → service binding so `@inject(N.REGISTRY)` works.
    this.application
      .bind(NatsConnectorComponentBindings.REGISTRY)
      .toClass(NatsConnectionRegistry)
      .inScope(BindingScope.SINGLETON);
  }
}

/**
 * Convert flat shorthand into canonical form.
 *
 * Flat detection: presence of top-level `servers: string[]` AND absence of
 * top-level `connections` key. Otherwise treat as canonical.
 */
export function normalizeOptions(
  input: NatsConnectorComponentOptions,
): NatsConnectorOptionsCanonical {
  if (isFlat(input)) {
    return {
      connections: {default: input as ConnectionOptions},
    };
  }
  const canonical = input as NatsConnectorOptionsCanonical;
  // Empty connections map is permitted: registry-only / dynamic-tenant mode
  // (see examples/03-multi-tenant-dynamic). Connections are added at runtime
  // via NatsConnectionRegistry.add() instead of statically here.
  return canonical;
}

function isFlat(
  input: NatsConnectorComponentOptions,
): input is ConnectionOptions {
  const candidate = input as Partial<NatsConnectorOptionsCanonical> &
    Partial<ConnectionOptions>;
  return Array.isArray(candidate.servers) && !candidate.connections;
}
