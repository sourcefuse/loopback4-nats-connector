# Example 19 — Registry Lifecycle & Rollback

Demonstrates the **H1 fix** (AsyncDisposableStack rollback in `registry.add()`)
and the **H4 fix** (`NatsConnectionRegistry` as `@lifeCycleObserver`).

## Problems

**H1:** If an `onAdd` handler threw, the connection was already open and bound
to zombie connection with no reference to drain it.

**H4:** Registry registered as a plain service, not a lifecycle observer.
`app.stop()` never called `registry.stop()` — dynamic connections leaked.

## Fixes

**H1:** `AsyncDisposableStack` stages resources with `defer()`; `stack.move()`
commits on success; on failure `disposeAsync()` rolls back automatically.

**H4:** `@lifeCycleObserver('nats-subscriptions')` ensures LB4 calls
`registry.stop()` during graceful shutdown.

## Run

```sh
nats-server -c server.conf
npm install && npm run build && npm start
```

Expected output shows `bad-tenant` rolled back and `good-tenant` drained on stop.
