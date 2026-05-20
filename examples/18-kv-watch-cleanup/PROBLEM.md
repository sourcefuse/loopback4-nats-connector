# C3 — KV Watch Iterator Leak

`JetStreamKvRepository.watch()` had no cleanup path:

```typescript
// BEFORE — no cleanup
for await (const entry of iter as AsyncIterable<KvEntry>) {
  yield { key: entry.key, value: ... };
}
// If caller breaks, iter keeps running forever
```

# H2 — Stale KV Handle After Reconnect

`kvOrInit()` cached `this.kv` at first open but never invalidated it.
After a broker reconnect the old `KV` object was broken; all operations
silently returned errors or stale state.
