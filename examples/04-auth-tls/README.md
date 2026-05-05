# 04 — auth-tls

mTLS auth. Self-signed CA + server cert + client cert committed under `creds/`. Broker requires TLS handshake with client-cert verification. Connector forwards `auth: {tls: {certFile, keyFile, caFile}}` to nats.js.

## NOT FOR PRODUCTION

The certificates under `creds/` are committed test artifacts. They have known private keys and **must not** be used outside this example. Generate fresh certs for any real deployment.

## Ports

- NATS broker: `4222`
- REST server: `3004` (override via `PORT`)
- Override NATS URL via `NATS_URL` env

## Run

Two terminals.

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
REST server running at http://127.0.0.1:3004
NATS connected to nats://localhost:4222
```

## Verify

```sh
nats --server=tls://localhost:4222 \
  --tlscert=creds/client.crt \
  --tlskey=creds/client.key \
  --tlsca=creds/ca.crt \
  pub ping.event '{}'
```

App stdout shows the handler invocation:

```
[PingController] @subscribe ping.event → {}
```

Connecting **without** the client cert is rejected by the broker (TLS handshake fails). That is the point of mTLS: the server demands a CA-signed client cert.

## Files

- `src/application.ts` — `TlsApp extends BootMixin(RestApplication)`. Registers `NatsConnectorComponent`.
- `src/controllers/ping.controller.ts` — `@subscribe('ping.event')` + `@reply('ping.echo')`.
- `src/index.ts` — boots the app, reads `PORT` + `NATS_URL` from env, passes mTLS paths.
- `server.conf` — broker config requiring TLS + client-cert verification.
- `creds/` — committed test certs (CA, server, client). NOT FOR PRODUCTION.

## Prereqs

- `nats-server` on PATH (devcontainer has it).
- `nats` CLI for verification (devcontainer has it).
