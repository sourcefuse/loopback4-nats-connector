# 05 — auth-nkey

NKEY auth. Standalone runnable LB4 RestApplication. Broker pins the user's public key; connector signs with the seed.

> **NOT FOR PRODUCTION.** The keypair under `creds/` is a committed test fixture. Generate fresh keys for any real use.

## Ports

- NATS broker: `4222`
- REST server: `3005` (override via `PORT`)
- Override NATS URL via `NATS_URL` env

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
Server is running at http://127.0.0.1:3005
```

**Terminal 3** — verify with `nats` CLI (signs with the test seed):

```sh
nats --server=nats://localhost:4222 --nkey=creds/user.seed pub ping.event '{"x":1}'
```

App stdout shows:

```
[PingController] @subscribe ping.event → {"x":1}
```

Round-trip through `@reply`:

```sh
nats --server=nats://localhost:4222 --nkey=creds/user.seed request ping.echo '{"hi":1}' --timeout=2s
```

## Files

- `src/application.ts` — `NkeyApp` registering `NatsConnectorComponent`.
- `src/controllers/ping.controller.ts` — `@subscribe` + `@reply`.
- `src/index.ts` — boots the app, reads the seed from `creds/user.seed`, passes `auth.nkey.seed` to the connector.
- `creds/user.seed`, `creds/user.pub` — committed test keypair (NOT FOR PRODUCTION).
- `server.conf` — broker config pinning the test public key.

## Prereqs

- `nats-server` on PATH (devcontainer has it).
- `nats` CLI for verification (devcontainer has it).
