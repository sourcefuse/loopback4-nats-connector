# 03 — multi-tenant-dynamic

Caveman shape. App boot empty. Registry add tenant runtime. Template `connection: '*'` catch all tenant.

## Ports

- Tenant A broker: `4223`
- Tenant B broker: `4224`
- REST server: `3003` (override via `PORT`)
- Override URLs via `TENANT_A_URL`, `TENANT_B_URL`

## Run

Three terminals.

**Terminal 1** — tenant-a broker:

```sh
nats-server -c server-tenant-a.conf
```

**Terminal 2** — tenant-b broker:

```sh
nats-server -c server-tenant-b.conf
```

**Terminal 3** — app:

```sh
npm install
npm run build
npm start
```

You should see:

```
REST server running at http://127.0.0.1:3003
[registry] added tenant 'tenant-a' → nats://localhost:4223
[registry] added tenant 'tenant-b' → nats://localhost:4224
```

## Verify

```sh
nats --server=nats://localhost:4223 pub orders.created '{"x":1}'
nats --server=nats://localhost:4224 pub orders.created '{"x":2}'
```

App stdout:

```
[FleetController] @subscribe orders.created on tenant=tenant-a → {"x":1}
[FleetController] @subscribe orders.created on tenant=tenant-b → {"x":2}
```

## No-broker boot

App boot success even no broker up. `nats: {connections: {}}` empty static.
Registry `add()` fails when broker down — logs `[registry] FAILED ...` and
skips that tenant. Other tenants still register. Bring broker up later →
restart app or call `registry.add()` again from your own code.

## Files

- `src/application.ts` — `TenantApp extends BootMixin(RestApplication)`. Registers `NatsConnectorComponent` with empty connections.
- `src/controllers/fleet.controller.ts` — `@subscribe` + `@reply` with `connection: '*'`. Logs tenant per delivery.
- `src/index.ts` — boots app on `PORT` (3003), then `registry.add()` per tenant from env.
- `server-bootstrap.conf` — optional baseline broker on `4222` (unused by default — dynamic example boots empty).
- `server-tenant-a.conf` — tenant-a broker on `4223`.
- `server-tenant-b.conf` — tenant-b broker on `4224`.

## Prereqs

- `nats-server` on PATH (devcontainer has it).
- `nats` CLI for verify (devcontainer has it).
