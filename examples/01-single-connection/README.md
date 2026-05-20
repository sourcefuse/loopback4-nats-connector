# 01 — single-connection

Flat shorthand. One NATS broker. `@subscribe` + `@reply` + `NatsPublisher`. Standalone runnable LB4 RestApplication.

## Ports

- NATS broker: `4222`
- REST server: `3001` (override via `PORT`)
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
REST server running at http://127.0.0.1:3001
NATS connected to nats://localhost:4222
```

**Terminal 3** — verify with `nats` CLI:

```sh
# Trigger @subscribe handler
nats pub hello.greet.world '{"name":"world"}'

# Watch the audit message published from inside the handler
nats sub audit.hello

# Round-trip through @reply
nats request hello.health '' --timeout=2s
```

App stdout shows handler invocations:

```
[HelloController] @subscribe hello.greet.world → {"name":"world"}
[HelloController] @reply hello.health
```

## Files

- `src/application.ts` — `HelloApp extends BootMixin(RestApplication)`. Registers `NatsConnectorComponent`.
- `src/controllers/hello.controller.ts` — `@subscribe` + `@reply` decorators.
- `src/index.ts` — boots the app, reads `PORT` + `NATS_URL` from env.
- `server.conf` — basic broker, port 4222, no auth.

## Prereqs

- `nats-server` on PATH (devcontainer has it).
- `nats` CLI for verification (devcontainer has it).
