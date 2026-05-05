# C3 Fix — try/finally in watch()

```typescript
async *watch(prefix?: string) {
  const iter = await kv.watch(prefix ? {key: prefix} : undefined);
  try {
    for await (const entry of iter as AsyncIterable<KvEntry>) yield { ... };
  } finally {
    (iter as {stop?: () => void}).stop?.(); // <- called on break/throw/done
  }
}
```

With Node 22 + TS 5.2, callers can use `await using`:

```typescript
// Caller side — await using ensures [Symbol.asyncDispose]() is called
// The async generator gets this method automatically in V8 >=20.4
for await (const entry of repo.watch()) {
  if (done) break; // iter.stop() runs via finally regardless
}
```

# H2 Fix — Reconnect Cache Invalidation

```typescript
constructor(js, codec, config, events?: EventEmitter, signal?: AbortSignal) {
  if (events) {
    const onReconnect = () => { this.kv = undefined; };
    events.on('reconnect', onReconnect);
    if (signal) addAbortListener(signal, () => events.off('reconnect', onReconnect));
  }
}
```
