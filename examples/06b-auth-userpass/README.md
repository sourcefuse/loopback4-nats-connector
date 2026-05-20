# 06b — auth-userpass

User/password auth. Broker requires `authorization: {user, password}`. Connector forwards `auth: {user, pass}` to nats.js. Standalone runnable LB4 RestApplication.

> **NOT FOR PRODUCTION.** The credentials `alice` / `secret` are test values baked into source. Real deployments must inject credentials via secrets management and never commit them.

## Ports

- NATS broker: `4222`
- REST server: `3007` (override via `PORT`)
- Override NATS URL via `NATS_URL`, user via `NATS_USER`, password via `NATS_PASS`

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
REST server running at http://127.0.0.1:3007
NATS connected to nats://localhost:4222
```

**Terminal 3** — verify with `nats` CLI.

Right creds (succeeds, app logs the handler invocation):

```sh
nats --server=nats://alice:secret@localhost:4222 pub ping.event '{}'
```

App stdout:

```
[PingController] @subscribe ping.event → {}
```

Wrong creds (broker rejects connection with `AUTHORIZATION_VIOLATION`):

```sh
nats --server=nats://wrong:bad@localhost:4222 pub ping.event '{}'
```

## Files

- `src/application.ts` — `UserPassAuthApp extends BootMixin(RestApplication)`. Registers `NatsConnectorComponent`.
- `src/controllers/ping.controller.ts` — `@subscribe` + `@reply` decorators.
- `src/index.ts` — boots the app, reads `PORT`, `NATS_URL`, `NATS_USER`, `NATS_PASS` from env.
- `server.conf` — broker with user/pass auth (test only).

## Prereqs

- `nats-server` on PATH (devcontainer has it).
- `nats` CLI for verification (devcontainer has it).
