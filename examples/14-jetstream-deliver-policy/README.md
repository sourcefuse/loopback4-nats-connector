# 14 — jetstream-deliver-policy

Three durables on one stream, different `deliverPolicy` each. Same backlog → distinct slices.

## Ports

- NATS: `4222`
- REST: `3014`

## Run

**Terminal 1** — broker:
```sh
nats-server -c server.conf
```

**Terminal 2** — provision + pre-publish backlog BEFORE booting app:
```sh
npm install
npm run build
npm run provision
nats publish metrics.cpu '{"v":1}'
nats publish metrics.cpu '{"v":2}'
nats publish metrics.cpu '{"v":3}'
```

**Terminal 3** — app:
```sh
npm start
```

App stdout immediately on boot:
```
[DeliverAll]  seq=1 subject=metrics.cpu
[DeliverAll]  seq=2 subject=metrics.cpu
[DeliverAll]  seq=3 subject=metrics.cpu     ← receives all 3 backlog
[DeliverLast] seq=3 subject=metrics.cpu     ← receives only the most recent
```

`DeliverNew` is silent — it skipped the backlog.

**Terminal 4** — publish 2 more (post-boot):
```sh
nats publish metrics.cpu '{"v":4}'
nats publish metrics.cpu '{"v":5}'
```

App stdout:
```
[DeliverAll]  seq=4 ...
[DeliverNew]  seq=4 ...
[DeliverAll]  seq=5 ...
[DeliverNew]  seq=5 ...
```

`DeliverLast` is silent (only fires once on boot).

## Files

- `server.conf` — JetStream broker.
- `bin/provision.ts` — creates stream `METRICS` (subjects `metrics.>`).
- `src/controllers/deliver-all.controller.ts` — `deliverPolicy: 'all'`.
- `src/controllers/deliver-new.controller.ts` — `deliverPolicy: 'new'`.
- `src/controllers/deliver-last.controller.ts` — `deliverPolicy: 'last'`.
- `src/index.ts` — boots app on port 3014.

## Prereqs

`nats-server` + `nats` CLI.
