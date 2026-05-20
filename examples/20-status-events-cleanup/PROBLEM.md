# C1 — Status Iterator Detached

```typescript
// BEFORE
export function wireStatusEvents(conn, emitter) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    for await (const status of conn.status()) {
      emitter.emit(status.type, data); // runs forever, no abort path
    }
  })();
}
```

# M1 — Listener Accumulation

```typescript
// BEFORE — in wireStatusEvents, called on every start():
emitter.on('error', () => {}); // added but never removed
// After N restarts: N error listeners, Node warns at >10
```
