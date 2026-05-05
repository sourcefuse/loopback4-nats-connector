# 02 — multi-connection-static

Two named NATS connections. `internal` + `ingress`. `default: 'internal'`. Standalone runnable LB4 RestApplication. Proves cross-broker isolation — message published on `internal` does NOT reach `ingress` subscriber.

## Ports

- NATS internal broker: `4222` (override via `INTERNAL_NATS_URL`)
- NATS ingress broker:  `4223` (override via `INGRESS_NATS_URL`)
- REST server:          `3002` (override via `PORT`)

## Run

Three terminals.

**Terminal 1** — internal broker:

```sh
nats-server -c server-internal.conf
```

**Terminal 2** — ingress broker:

```sh
nats-server -c server-ingress.conf
```

**Terminal 3** — app:

```sh
npm install
npm run build
npm start
```

You should see:

```
REST server running at http://127.0.0.1:3002
NATS 'internal' connected to nats://localhost:4222
NATS 'ingress' connected to nats://localhost:4223
```

## Verify with `nats` CLI

```sh
# Publish on internal broker → InternalController fires
nats --server=nats://localhost:4222 pub orders.created '{"id":1}'

# Publish on ingress broker → IngressController fires
nats --server=nats://localhost:4223 pub public.x '{"id":2}'
```

App stdout shows handler invocations:

```
[InternalController] @subscribe orders.created (conn=internal) → {"id":1}
[IngressController] @subscribe public.x (conn=ingress) → {"id":2}
```

## Prove isolation

Cross-publish — same subject, wrong broker. Handler must NOT fire.

```sh
# Publish public.x on internal broker → IngressController must NOT fire
nats --server=nats://localhost:4222 pub public.x '{"leak":true}'

# Publish orders.created on ingress broker → InternalController must NOT fire
nats --server=nats://localhost:4223 pub orders.created '{"leak":true}'
```

Confirm by *absence* of new log lines in app stdout. Each connection is fully isolated.

## Files

- `src/application.ts` — `MultiConnApp` with two named connections.
- `src/controllers/internal.controller.ts` — internal-only subscriber on `orders.>`.
- `src/controllers/ingress.controller.ts` — ingress-only subscriber on `public.>`.
- `src/index.ts` — boots the app, reads `PORT`, `INTERNAL_NATS_URL`, `INGRESS_NATS_URL` from env.
- `server-internal.conf` — internal broker, port 4222, no auth.
- `server-ingress.conf`  — ingress broker, port 4223, no auth.

## Prereqs

- `nats-server` on PATH (devcontainer has it).
- `nats` CLI for verification (devcontainer has it).
