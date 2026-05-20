# 10 — jetstream-consumer

`@jsConsume` push consumer + `autoAck`. Standalone runnable LB4 RestApplication.

## Ports

- NATS: `4222`
- REST: `3010`

## Run

Three terminals.

**Terminal 1** — broker:
```sh
nats-server -c server.conf
```

**Terminal 2** — provision stream (one-time):
```sh
npm install
npm run build
npm run provision
```

Should print `Stream ORDERS created` (or "already exists" on rerun).

**Terminal 3** — app:
```sh
npm start
```

Output:
```
REST server running at http://127.0.0.1:3010
NATS connected to nats://localhost:4222 (JetStream)
```

**Terminal 4** — publish to JetStream-stored stream:
```sh
nats publish orders.created '{"orderId":"o-1","amount":10}'
nats publish orders.created '{"orderId":"o-2","amount":20}'
```

App stdout shows:
```
[OrderController] @jsConsume seq=1 deliveryCount=1 → {"orderId":"o-1","amount":10}
[OrderController] @jsConsume seq=2 deliveryCount=1 → {"orderId":"o-2","amount":20}
```

## Files

- `server.conf` — JetStream-enabled broker, store_dir `./js-store/` (gitignored).
- `bin/provision.ts` — idempotent stream provisioner.
- `src/application.ts` — `JsConsumerApp` registering NATS component.
- `src/controllers/order.controller.ts` — `@jsConsume('ORDERS', 'order-archiver', {autoAck: true, deliverPolicy: 'all'})`.
- `src/index.ts` — boots app, reads `PORT` + `NATS_URL` from env.

## Prereqs

`nats-server` + `nats` CLI on PATH.
