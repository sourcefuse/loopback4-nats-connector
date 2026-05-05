# 12 — jetstream-durable

Durable JetStream consumer survives app restart. Server-side checkpoint resumes from last ack'd sequence — no replays, no skips.

## Ports

- NATS: `4222`
- REST: `3012`

## Run

**Terminal 1** — broker (KEEP RUNNING across app restarts):
```sh
nats-server -c server.conf
```

**Terminal 2** — provision (one-time):
```sh
npm install
npm run build
npm run provision
```

**Terminal 3** — app:
```sh
npm start
```

**Terminal 4** — exercise the durable resume:
```sh
# Phase 1: app running, publish a few:
nats publish jobs.do '{"jobId":"j-1"}'
nats publish jobs.do '{"jobId":"j-2"}'
# App stdout: seq=1, seq=2.

# Phase 2: stop app (Ctrl-C in terminal 3). Publish while NO subscriber:
nats publish jobs.do '{"jobId":"j-3"}'
nats publish jobs.do '{"jobId":"j-4"}'

# Phase 3: restart app:
npm start
# App stdout: seq=3, seq=4 ONLY. Sequences 1, 2 NOT replayed (already ack'd).
```

## Files

- `server.conf` — JetStream-enabled broker.
- `bin/provision.ts` — creates stream `JOBS` (subjects `jobs.>`).
- `src/controllers/durable.controller.ts` — `@jsConsume('JOBS', 'job-worker', {autoAck: true, deliverPolicy: 'all'})`.
- `src/index.ts` — boots app on port 3012.

## Prereqs

`nats-server` + `nats` CLI.
