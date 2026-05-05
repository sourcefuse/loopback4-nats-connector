/**
 * Example 20 — Status Events Cleanup
 *
 * PROBLEM (C1): `wireStatusEvents()` launched a detached async IIFE that
 * iterated `conn.status()` forever. On `app.stop()`, the iterator kept
 * running until the connection drained — there was no way to stop it early.
 * On restart, a second iterator was started, doubling memory and CPU.
 *
 * PROBLEM (M1): Each `start()` called `emitter.on('error', ...)` but
 * `stop()` never called `removeAllListeners()`. Listeners accumulated across
 * restarts, causing the MaxListenersExceeded warning.
 *
 * FIX (C1+M1): `wireStatusEvents()` now accepts an `AbortSignal`. On abort:
 *   1. `addAbortListener(signal, () => emitter.removeAllListeners())` — M1 fix
 *   2. `if (signal.aborted) break` in the for-await loop — C1 fix
 *
 * `ConnectionObserver` holds an `AbortController`; `stop()` calls `.abort()`
 * before draining, so the iterator exits cleanly.
 *
 * Run: nats-server -c server.conf
 *      npm run build && npm start
 */
import {EventEmitter} from 'events';
import {Application} from '@loopback/core';
import {
  NatsConnectorComponent,
  NatsConnectorComponentBindings as N,
} from 'loopback-nats-connector';

class StatusApp extends Application {
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
  const app = new StatusApp();
  await app.start();

  const emitter = await app.get<EventEmitter>(N.EVENTS);
  const statusEvents: string[] = [];
  emitter.on('reconnect', () => statusEvents.push('reconnect'));
  emitter.on('disconnect', () => statusEvents.push('disconnect'));

  console.log(
    '[example] Connected. Listener count (before stop):',
    emitter.listenerCount('error'),
  );

  // Stop the app — C1 fix: AbortController aborts status iterator cleanly.
  //                M1 fix: addAbortListener removes all emitter listeners.
  await app.stop();

  console.log(
    '[example] Listener count (after stop):',
    emitter.listenerCount('error'),
  );
  console.log(
    '[example] Expected: 0 (all listeners removed by addAbortListener)',
  );

  // Demonstrate restart safety: start -> stop -> start does not accumulate listeners
  await app.start();
  const emitter2 = await app.get<EventEmitter>(N.EVENTS);
  const countAfterRestart = emitter2.listenerCount('error');
  await app.stop();

  console.log(
    '[example] Listener count after restart cycle:',
    countAfterRestart,
  );
  console.log('[example] Expected: same as initial (no accumulation)');
  console.log('[app] clean exit');
}

void main().catch(err => {
  console.error('[app] fatal:', err);
  process.exit(1);
});
