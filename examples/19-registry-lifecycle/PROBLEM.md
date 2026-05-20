# H1 — Registry add() No Rollback

```typescript
// BEFORE
const conn = await connect(opts);
bindConnectionForName(app, name, conn, ...); // <- already bound
try {
  for (const h of handlers) await h(name);
} catch {
  // conn still open, bindings still registered — zombie!
  throw err;
}
```

# H4 — Registry Not a LifeCycle Observer

```typescript
// BEFORE — in component.ts
readonly services: ServiceOrProviderClass[] = [NatsConnectionRegistry];
// app.stop() never reaches registry.stop() -> connections never drained
```
