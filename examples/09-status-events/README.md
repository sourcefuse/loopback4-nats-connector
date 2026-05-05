# 09 — status-events

Per-connection `EventEmitter` at `N.EVENTS`. Surfaces nats.js status iterator events. Standalone runnable LB4 RestApplication that logs live connection status changes.

## Ports

- NATS broker: `4222`
- REST server: `3009` (override via `PORT`)
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
REST server running at http://127.0.0.1:3009
NATS connected to nats://localhost:4222
```

## Verify status events

- **Kill the broker** (`Ctrl-C` in terminal 1) — within ~2s the app log shows:

  ```
  [StatusController] disconnect
  ```

- **Restart the broker** (`nats-server -c server.conf` again) — the app log shows:

  ```
  [StatusController] reconnect
  ```

The `pingInterval: 2000` setting (in `src/index.ts`) makes status changes visible quickly. Default ping interval is 2 minutes, which would make this demo painfully slow.

## Files

- `src/application.ts` — `StatusApp extends BootMixin(RestApplication)`. Registers `NatsConnectorComponent` with reconnect tuning.
- `src/controllers/status.controller.ts` — injects `N.EVENTS` and logs each event.
- `src/index.ts` — boots the app, reads `PORT` + `NATS_URL` from env.
- `server.conf` — basic broker, port 4222, no auth.

## Prereqs

- `nats-server` on PATH (devcontainer has it).
