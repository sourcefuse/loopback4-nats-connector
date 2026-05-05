# 06 — auth-token

Token auth. Broker requires `authorization: {token: 's3cr3t'}`. Connector forwards `auth: {token: 's3cr3t'}` to nats.js. Standalone runnable LB4 RestApplication.

> **NOT FOR PRODUCTION.** The token `s3cr3t` is a test value baked into source. Real deployments must inject tokens via secrets management and never commit them.

## Ports

- NATS broker: `4222`
- REST server: `3006` (override via `PORT`)
- Override NATS URL via `NATS_URL`, token via `NATS_TOKEN`

## Run

Three terminals.

**Terminal 1** — broker:

```sh
nats-server -c server.conf
```

**Terminal 2** — app:

```sh
npm install
npm run build
npm start
```

You should see:

```
REST server running at http://127.0.0.1:3006
NATS connected to nats://localhost:4222
```

**Terminal 3** — verify with `nats` CLI.

Right token (succeeds, app logs the handler invocation):

```sh
nats --server=nats://s3cr3t@localhost:4222 pub ping.event '{}'
```

App stdout:

```
[PingController] @subscribe ping.event → {}
```

Wrong token (broker rejects connection with `AUTHORIZATION_VIOLATION`):

```sh
nats --server=nats://wrong@localhost:4222 pub ping.event '{}'
```

## Files

- `src/application.ts` — `TokenAuthApp extends BootMixin(RestApplication)`. Registers `NatsConnectorComponent`.
- `src/controllers/ping.controller.ts` — `@subscribe` + `@reply` decorators.
- `src/index.ts` — boots the app, reads `PORT`, `NATS_URL`, `NATS_TOKEN` from env.
- `server.conf` — broker with token auth (test only).

## Prereqs

- `nats-server` on PATH (devcontainer has it).
- `nats` CLI for verification (devcontainer has it).
