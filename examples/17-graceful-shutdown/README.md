# Example 17 — Graceful Shutdown

Demonstrates the **C2 fix** (inflight handler tracking in `SubscriptionBooter`).

## Problem

Before the fix, calling `app.stop()` while a slow `@subscribe` handler was
still running would return immediately, orphaning the async work and risking
use-after-free on the LB4 context.

## Fix

`SubscriptionBooter` now tracks every dispatch promise in an `inflight` Set.
`stop()` awaits `Promise.all([...inflight])` before draining subscriptions.

## Run

Terminal 1 — broker:
```sh
nats-server -c server.conf
```

Terminal 2 — app:
```sh
npm install && npm run build && npm start
```

Terminal 3 — trigger slow job then stop:
```sh
nats pub work.slow '{}'
# wait ~1 s, then Ctrl+C in terminal 2
```

With the fix you will see `[worker] job done` before the process exits.
Without the fix the process would exit immediately on Ctrl+C, orphaning the job.
