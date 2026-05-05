# Example 18 — KV Watch Cleanup

Demonstrates the **C3 fix** (KV watch iterator cleanup) and **H2 fix**
(stale KV cache invalidation on reconnect).

## Problems

**C3:** `for await (const e of repo.watch())` followed by `break` left the
NATS `QueuedIterator` running in the background — an open subscription handle
that accumulated across restarts.

**H2:** After a NATS broker reconnect, the cached `KV` handle was stale.
Operations silently failed or returned stale data.

## Fixes

**C3:** `watch()` wraps the loop in `try/finally` and calls `iter.stop?.()`.
Works for `break`, `throw`, and normal exhaustion.

**H2:** Constructor accepts `events?: EventEmitter`. On `'reconnect'`, clears
`this.kv` so the next call re-initialises from the live connection.

## Run

```sh
nats-server -c server.conf   # or: nats-server -js
npm install && npm run build && npm start
```
