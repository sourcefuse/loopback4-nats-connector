/**
 * Example 17 — Graceful Shutdown
 *
 * PROBLEM (C2): SubscriptionBooter called stop() while async dispatch
 * promises were still running → use-after-free on LB4 context, orphaned
 * work, no error surfaced.
 *
 * FIX: inflight Set tracks every dispatch promise. stop() awaits all
 * before draining connections.
 *
 * Run: nats-server -c server.conf   (terminal 1)
 *      npm run build && npm start    (terminal 2)
 *      nats pub work.slow '{}'       (terminal 3, triggers slow job)
 *      Ctrl+C in terminal 2          → observe "job done" before process exits
 */
import {BootMixin} from '@loopback/boot';
import {Application, lifeCycleObserver} from '@loopback/core';
import {
  NatsConnectorComponent,
  NatsConnectorComponentBindings,
  subscribe,
} from 'loopback-nats-connector';

// ── Slow handler controller ────────────────────────────────────────────────
class WorkController {
  @subscribe('work.slow')
  async handleSlowJob(_payload: unknown) {
    console.log('[worker] job started, will take 3 s ...');
    await new Promise(r => setTimeout(r, 3000));
    console.log('[worker] job done');
  }
}

// ── Minimal LB4 app ────────────────────────────────────────────────────────
class GracefulApp extends BootMixin(Application) {
  constructor() {
    super();
    this.configure(NatsConnectorComponentBindings.COMPONENT).to({
      servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
    });
    this.component(NatsConnectorComponent);
    this.controller(WorkController);
    this.projectRoot = __dirname;
    this.bootOptions = {
      controllers: {dirs: [], extensions: ['.controller.js'], nested: false},
    };
  }
}

async function main() {
  const app = new GracefulApp();
  await app.boot();
  await app.start();
  console.log('[app] started — waiting for messages (SIGTERM/SIGINT to stop)');

  // AbortSignal.any (Node 20.3+) composes multiple signals.
  // Here we compose a manual abort (for testing) with the process signal.
  const ac = new AbortController();
  const stop = async () => {
    console.log('[app] shutdown signal received, draining in-flight work ...');
    ac.abort();
    await app.stop();
    console.log('[app] clean exit');
    process.exit(0);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

void main().catch(err => {
  console.error('[app] fatal:', err);
  process.exit(1);
});
