# H1 Fix — AsyncDisposableStack

```typescript
async add(name, opts) {
  const stack = new AsyncDisposableStack();
  try {
    const conn = await connect(opts);
    stack.defer(async () => conn.drain().catch(() => {}));

    const {events} = bindConnectionForName(app, name, conn, opts.jetstream);
    stack.defer(() => unbindConnectionForName(app, name));

    for (const h of handlers) await h(name); // may throw

    stack.move(); // <- commit: deferred cleanups transferred, original empty
    this.conns.set(name, {conn, events});
  } finally {
    await stack.disposeAsync(); // <- no-op after move(); rollback if threw
  }
}
```

# H4 Fix — @lifeCycleObserver

```typescript
// In component.ts
readonly lifeCycleObservers = [ConnectionObserver, SubscriptionBooter, NatsConnectionRegistry];
readonly services = []; // <- no double-binding
```
