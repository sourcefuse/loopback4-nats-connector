# C2 Fix — inflight Set

```typescript
private inflight = new Set<Promise<void>>();

// In callback:
const p = this.dispatchCore(...).catch(err => {
  console.error('[nats] unhandled dispatch error:', err);
});
this.inflight.add(p);
void p.finally(() => this.inflight.delete(p));

// In stop():
await Promise.all([...this.handles].map(h => h.sub.drain().catch(() => {})));
await Promise.all([...this.inflight]); // <- NEW: wait for all handlers
this.handles = [];
```

`AbortSignal.any([signal1, signal2])` (Node 20.3+) lets callers compose
a process-level SIGTERM signal with an observer's own AbortController, so
a single `if (signal.aborted) return` check covers both paths.
