/**
 * Example 19 — Registry Lifecycle & Rollback
 *
 * PROBLEM (H1): `NatsConnectionRegistry.add()` had no rollback. If an onAdd
 * handler threw, the connection was already open and bindings already registered
 * — a "zombie" connection that consumed resources but was unreachable.
 *
 * PROBLEM (H4): `NatsConnectionRegistry` was registered as a plain service,
 * not a `@lifeCycleObserver`. `app.stop()` never called `registry.stop()`,
 * so dynamic connections were never drained.
 *
 * FIX (H1): `add()` uses `AsyncDisposableStack` (Node 22 / TS 5.2).
 * Resources are deferred; on handler failure, `disposeAsync()` drains the
 * connection and unbinds keys automatically — no zombie.
 *
 * FIX (H4): `@lifeCycleObserver('nats-subscriptions')` on registry ensures
 * LB4 calls `start()` / `stop()` at the right lifecycle phase.
 *
 * Run: nats-server -c server.conf
 *      npm run build && npm start
 */
import {Application} from '@loopback/core';
import {
  NatsConnectorComponent,
  NatsConnectorComponentBindings as N,
  NatsConnectionRegistry,
} from 'loopback-nats-connector';

class RegistryApp extends Application {
  constructor() {
    super();
    this.configure(N.COMPONENT).to({
      connections: {
        default: {servers: [process.env.NATS_URL ?? 'nats://localhost:4222']},
      },
    });
    this.component(NatsConnectorComponent);
  }
}

async function main() {
  const app = new RegistryApp();
  await app.start();

  const registry = await app.get<NatsConnectionRegistry>(N.REGISTRY);

  // ── H1 demo: bad onAdd handler → clean rollback ──────────────────────────
  registry.onAdd(name => {
    if (name === 'bad-tenant') throw new Error('onboarding failed');
  });

  console.log('[example] Adding bad-tenant (will fail in onAdd handler)...');
  try {
    await registry.add('bad-tenant', {
      servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
    });
  } catch (err) {
    console.log(`[example] add() threw as expected: ${(err as Error).message}`);
  }

  // Without H1 fix: registry.has('bad-tenant') === true — zombie!
  // With H1 fix:    registry.has('bad-tenant') === false — clean rollback
  console.log(
    '[example] registry.has("bad-tenant"):',
    registry.has('bad-tenant'),
  );
  console.log('[example] Expected: false (AsyncDisposableStack rolled back)');

  // ── H4 demo: registry.stop() called by LB4 on app.stop() ─────────────────
  await registry.add('good-tenant', {
    servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
  });
  console.log('[example] Added good-tenant. Calling app.stop()...');

  // H4 fix: registry is a @lifeCycleObserver so app.stop() calls registry.stop()
  await app.stop();

  // Without H4 fix: good-tenant connection would still be open after app.stop()
  console.log('[example] registry.list() after app.stop():', registry.list());
  console.log('[example] Expected: [] (all drained by lifecycle)');
  console.log('[app] clean exit');
}

void main().catch(err => {
  console.error('[app] fatal:', err);
  process.exit(1);
});
