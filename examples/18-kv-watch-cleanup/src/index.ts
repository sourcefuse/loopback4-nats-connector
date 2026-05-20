/**
 * Example 18 — KV Watch Cleanup
 *
 * PROBLEM (C3): Breaking from `for await (const e of repo.watch())` left the
 * underlying NATS QueuedIterator running — open handle, leaked subscription.
 *
 * PROBLEM (H2): After a broker reconnect, the cached `KV` handle pointed to a
 * stale object. All KV operations silently failed or returned stale data.
 *
 * FIX (C3): `watch()` wraps the iterator in try/finally; `iter.stop?.()` is
 * called on break, throw, or normal exhaustion.
 *
 * FIX (H2): `JetStreamKvRepository` accepts optional `events` + `signal` in
 * constructor. On 'reconnect' event it clears `this.kv` so the next call
 * reinitialises from the live connection.
 *
 * Pattern shown: `await using` — TypeScript 5.2 + Node 22+ async disposal.
 * The source uses try/finally for Node 20 compatibility; `await using` is the
 * caller-side sugar that the fix makes safe.
 *
 * Run: nats-server -c server.conf -js   (terminal 1)
 *      npm run build && npm start         (terminal 2)
 */
import {inject} from '@loopback/core';
import {BootMixin} from '@loopback/boot';
import {Application} from '@loopback/core';
import type {JetStreamClient} from '@nats-io/jetstream';
import {EventEmitter} from 'events';
import {
  NatsConnectorComponent,
  NatsConnectorComponentBindings,
  JetStreamKvRepository,
  NatsConnectorComponentBindings as N,
} from 'loopback-nats-connector';
import type {Codec} from 'loopback-nats-connector';

// ── Concrete KV repository ─────────────────────────────────────────────────
interface ConfigEntry {
  value: string;
}

class ConfigRepository extends JetStreamKvRepository<ConfigEntry> {
  constructor(
    @inject(N.JETSTREAM) js: JetStreamClient,
    @inject(N.CODEC) codec: Codec<unknown>,
    @inject(N.EVENTS, {optional: true}) events?: EventEmitter,
  ) {
    super(js, codec, {bucket: 'configs'}, events);
  }
}

// ── Minimal app ────────────────────────────────────────────────────────────
class KvWatchApp extends BootMixin(Application) {
  constructor() {
    super();
    this.configure(NatsConnectorComponentBindings.COMPONENT).to({
      connections: {
        default: {
          servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
          jetstream: {},
        },
      },
    });
    this.component(NatsConnectorComponent);
    this.bind('repositories.ConfigRepository').toClass(ConfigRepository);
    this.projectRoot = __dirname;
    this.bootOptions = {
      controllers: {dirs: [], extensions: ['.controller.js'], nested: false},
    };
  }
}

async function main() {
  const app = new KvWatchApp();
  await app.boot();
  await app.start();

  const repo = await app.get<ConfigRepository>('repositories.ConfigRepository');

  // Seed two entries
  await repo.put('theme', {value: 'dark'});
  await repo.put('lang', {value: 'en'});

  console.log('[example] watching first 1 entry then breaking (C3 pattern)...');

  // C3 FIX: try/finally in watch() ensures iter.stop() is called on break.
  // With Node 22 + TS 5.2, this is also expressible as `await using`:
  //
  //   await using iter = repo.watch();
  //   for await (const entry of iter) { ...; break; }
  //
  // The source uses try/finally so Node 20 apps work too.
  let count = 0;
  for await (const entry of repo.watch()) {
    console.log('[entry]', entry.key, '=', entry.value?.value);
    count++;
    if (count >= 1) break; // <- iterator.stop() called automatically in finally
  }

  console.log('[example] broke after 1 entry — no leaked subscription');

  // H2 FIX demonstration: if the broker reconnects, repo auto-reinitialises
  // its KV handle on the next operation.
  console.log('[example] done. Stopping...');
  await app.stop();
  console.log('[app] clean exit');
}

void main().catch(err => {
  console.error('[app] fatal:', err);
  process.exit(1);
});
