# C2 — Floating Dispatch Promises

`SubscriptionBooter.registerCore()` called `this.dispatchCore(...)` without
awaiting the result and without catching errors. The NATS subscription callback
is synchronous — async handlers had to be fire-and-forget.

**Consequences:**
1. `stop()` drained subscriptions immediately, before handlers finished.
2. Handler rejections became unhandled `Promise` rejections → Node >=15 crash.
3. Handlers accessing LB4 context after stop() caused use-after-free errors.
