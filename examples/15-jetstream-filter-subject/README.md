# 15 — jetstream-filter-subject

Two durables on one stream, disjoint `filterSubject` prefixes. Zero cross-prefix leakage.

## Ports

- NATS: `4222`
- REST: `3015`

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

**Terminal 4** — verify isolation:
```sh
nats publish events.orders.created '{"id":1}'
nats publish events.orders.cancelled '{"id":2}'
nats publish events.payments.charged '{"id":3}'
nats publish events.payments.refunded '{"id":4}'
```

App stdout shows EXACTLY:
```
[OrdersController]   subject=events.orders.created
[OrdersController]   subject=events.orders.cancelled
[PaymentsController] subject=events.payments.charged
[PaymentsController] subject=events.payments.refunded
```

`OrdersController` never sees a `events.payments.*` subject. `PaymentsController` never sees a `events.orders.*` subject.

## Files

- `server.conf` — JetStream broker.
- `bin/provision.ts` — creates stream `EVENTS` (subjects `events.>`).
- `src/controllers/orders.controller.ts` — `filterSubject: 'events.orders.>'`.
- `src/controllers/payments.controller.ts` — `filterSubject: 'events.payments.>'`.
- `src/index.ts` — boots app on port 3015.

## Prereqs

`nats-server` + `nats` CLI.
