# 13 — jetstream-manual-ack

Explicit `ctx.ack()` / `ctx.nak()`. nak triggers redelivery; `deliveryCount` increments. ack stops it.

## Ports

- NATS: `4222`
- REST: `3013`

## Run

**Terminal 1** — broker:
```sh
nats-server -c server.conf
```

**Terminal 2** — provision:
```sh
npm install && npm run build && npm run provision
```

**Terminal 3** — app:
```sh
npm start
```

**Terminal 4** — verify:
```sh
nats publish tasks.go '{"id":"good"}'
# App: id=good deliveryCount=1 → ACK   (1 line)

nats publish tasks.go '{"id":"flaky"}'
# App: id=flaky deliveryCount=1 → NAK
# App: id=flaky deliveryCount=2 → ACK  (2 lines, ~50ms apart)
```

After ack the message stops being redelivered.

## Files

- `server.conf` — JetStream broker.
- `bin/provision.ts` — creates stream `TASKS` (subjects `tasks.>`).
- `src/controllers/manual-ack.controller.ts` — `@jsConsume` with `ackPolicy: 'explicit'`, `maxDeliver: 5`, `ackWait: 1000`.
- `src/index.ts` — boots app on port 3013.

## Prereqs

`nats-server` + `nats` CLI.
