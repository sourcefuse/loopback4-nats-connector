# Example 20 — Status Events Cleanup

Demonstrates the **C1 fix** (detached status iterator) and **M1 fix**
(listener accumulation across restarts).

## Problems

**C1:** `wireStatusEvents()` ran a detached `async () => { for await ... }`
that had no stop mechanism. On `app.stop()`, it kept running until the socket
closed. On restart, a duplicate was started — 2x memory, 2x CPU.

**M1:** Each `start()` added `emitter.on('error', ...)` but no cleanup removed
it. Across 10 restarts: 10 listeners — MaxListenersExceeded warning, memory leak.

## Fixes

Both fixed in `wireStatusEvents(conn, emitter, signal: AbortSignal)`:

```typescript
// M1: remove all listeners when signal aborts
addAbortListener(signal, () => emitter.removeAllListeners());

// C1: exit the status iterator when signal aborts
for await (const status of conn.status()) {
  if (signal.aborted) break;
  emitter.emit(status.type, data);
}
```

`ConnectionObserver` holds `private controller = new AbortController()`.
`stop()` calls `this.controller.abort()` first, then drains connections.

## Run

```sh
nats-server -c server.conf
npm install && npm run build && npm start
```

Expected: listener count drops to 0 after stop; restart cycle doesn't accumulate.
