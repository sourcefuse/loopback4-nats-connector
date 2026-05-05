# 16 — jetstream-multi-conn-isolation

Two JS-enabled brokers, both have stream `ALPHA`, but a `@jsConsume` on connection `a` only ever sees broker A's messages. Connection-scoped JetStream contexts.

## Ports

- NATS broker A: `4222` (JetStream, store_dir `./js-store-a/`)
- NATS broker B: `4223` (JetStream, store_dir `./js-store-b/`)
- REST: `3016`

## Run

**Terminal 1** — broker A:
```sh
nats-server -c server-a.conf
```

**Terminal 2** — broker B:
```sh
nats-server -c server-b.conf
```

**Terminal 3** — provision both:
```sh
npm install && npm run build && npm run provision
```

**Terminal 4** — app:
```sh
npm start
```

App stdout:
```
REST server running at http://127.0.0.1:3016
NATS 'a' → nats://localhost:4222 (JetStream)
NATS 'b' → nats://localhost:4223 (JetStream)
```

**Terminal 5** — publish to broker A:
```sh
nats --server=nats://127.0.0.1:4222 publish alpha.fromA '{"id":"a1"}'
```

App stdout: `[AlphaOnA] connection=a subject=alpha.fromA`. **No** `[AlphaOnB]` line.

**Terminal 5** — publish to broker B:
```sh
nats --server=nats://127.0.0.1:4223 publish alpha.fromB '{"id":"b1"}'
```

App stdout: `[AlphaOnB] connection=b subject=alpha.fromB`. **No** `[AlphaOnA]` line.

## Files

- `server-a.conf` — broker A on 4222 (JS).
- `server-b.conf` — broker B on 4223 (JS).
- `bin/provision.ts` — creates stream `ALPHA` on BOTH brokers.
- `src/controllers/alpha-on-a.controller.ts` — `@jsConsume('ALPHA', 'alpha-a-worker', {connection: 'a'})`.
- `src/controllers/alpha-on-b.controller.ts` — `@jsConsume('ALPHA', 'alpha-b-worker', {connection: 'b'})`.
- `src/index.ts` — configures TWO named connections, each with its own `jetstream: {}` block.

## Prereqs

`nats-server` + `nats` CLI.
