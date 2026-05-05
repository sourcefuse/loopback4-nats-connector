# 🌊 JetStream — natsbyexample.com Recreations

> Persistent streams, durable consumers, modern API only — no legacy push consumers.
> Single LB4 app on **port 3201** demonstrating 10 examples.

## Coverage

| natsbyexample example | What it shows | Stream / Consumer | Endpoint | Code |
|------------------------|---------------|-------------------|----------|------|
| [Limits-based Stream](https://natsbyexample.com/examples/jetstream/limits-stream/go) | Retention by `max_msgs` / `max_bytes` / `max_age` | EVENTS / event-processor | `POST /events` + `GET /events/process` | [`bin/provision.ts`](./bin/provision.ts), [`src/controllers/jetstream.controller.ts`](./src/controllers/jetstream.controller.ts) |
| [Interest-based Stream](https://natsbyexample.com/examples/jetstream/interest-stream/go) | Retain only while consumer interested | ORDERS / order-validator | `POST /orders` + `GET /orders/process` | jetstream.controller.ts |
| [Work-queue Stream](https://natsbyexample.com/examples/jetstream/workqueue-stream/go) | Each message consumed exactly once (ack = delete) | JOBS / job-worker | `POST /jobs` + `GET /jobs/next` | jetstream.controller.ts |
| [Pull Consumer](https://natsbyexample.com/examples/jetstream/pull-consumer/go) | Client drives flow with `consumer.fetch({batch})` / `consumer.next()` | All endpoints use pull | jetstream.controller.ts |
| [Pull Consumer - Applying Limits](https://natsbyexample.com/examples/jetstream/pull-consumer-limits/go) | `max_ack_pending=5`, `max_batch=10`, `max_waiting=100`, `max_bytes=1MB`, `max_expires=30s` enforced server-side | PRIORITY / priority-limited | `POST /priority` + `GET /priority/process` | provision.ts + jetstream.controller.ts |
| [Migration to new JetStream API](https://natsbyexample.com/examples/jetstream/api-migration/go) | All endpoints use `js.streams`, `js.consumers` (no legacy `Subscribe()`) | — | All | jetstream.controller.ts (every method) |
| [Consumer - Fetch Messages](https://natsbyexample.com/examples/jetstream/consumer-fetch-messages/java) | `fetch({max_messages, expires})` batch + `next({expires})` single | All endpoints | All | jetstream.controller.ts |
| [Confirmed Message Ack](https://natsbyexample.com/examples/jetstream/ack-ack/go) | `await msg.ackAck()` waits for server confirmation | ORDERS / order-validator | `GET /orders/process` | jetstream.controller.ts (`processOrders`) |
| [List Subjects](https://natsbyexample.com/examples/jetstream/list-subjects/go) | `stream.info({subjects_filter})` populates Subjects map | any stream | `GET /streams/{name}/subjects?filter=...` | jetstream.controller.ts (`listSubjects`) |
| [Subject-Mapped Partitions](https://natsbyexample.com/examples/jetstream/partitions/cli) | Server-side mapping `events.*` → `events.<key>.<partition>`; deterministic distribution | PARTITION-0..4 / partition-consumer | `POST /partitioned-events` + `GET /partitions/{n}/process` | [`server-partitions.conf`](./server-partitions.conf) + provision.ts (PARTITIONS=1) + jetstream.controller.ts |

⏭️ **Skipped (legacy)**: Push Consumers, Queue Push Consumers, Multi-Stream Consumption.

---

## 🚀 Run — Standard mode

```sh
# 1. Start JetStream-enabled server
nats-server -js &

# 2. Build, provision streams + consumers
npm install && npm run build
npm run provision
# Creates: EVENTS, ORDERS, JOBS, SUBJECTS, PRIORITY streams + matching consumers

# 3. Start app
npm start
# Output: REST at http://127.0.0.1:3201
```

---

## 🧪 Test scenarios

### 1. Limits-based Stream + Pull Consumer

```sh
# Publish events to JetStream (persisted)
curl -s -X POST http://localhost:3201/events \
  -H 'content-type: application/json' \
  -d '{"type":"login","user":"alice"}' | jq .
# → {"seq":1}

# Drain via pull-consumer batch fetch
curl -s 'http://localhost:3201/events/process?batch=10' | jq .
# → {"processed":N,"items":[{"seq":...,"subject":"events.login","type":"login"}, ...]}
```

### 2. Interest Stream + Confirmed Ack (ack-ack)

```sh
curl -s -X POST http://localhost:3201/orders \
  -H 'content-type: application/json' \
  -d '{"orderId":"o-1","amount":99}' | jq .

# Process — uses await msg.ackAck() for guaranteed delivery
curl -s http://localhost:3201/orders/process | jq .
# → {"processed":1,"items":[{"seq":1,"orderId":"o-1","ack":"confirmed"}]}
```

### 3. Work-queue Stream

```sh
curl -s -X POST http://localhost:3201/jobs \
  -H 'content-type: application/json' \
  -d '{"jobId":"j-1","type":"resize"}' | jq .

curl -s http://localhost:3201/jobs/next | jq .
# Subsequent calls return {"empty":true} — work-queue deletes on ack
```

### 4. Pull Consumer Limits

PRIORITY consumer enforces `max_batch=10`. Try to exceed it:

```sh
# Publish 9 priority tasks
for p in high normal low; do
  for i in 1 2 3; do
    curl -s -X POST http://localhost:3201/priority \
      -H 'content-type: application/json' \
      -d "{\"taskId\":\"t-$p-$i\",\"priority\":\"$p\"}" >/dev/null
  done
done

# Try fetch with batch=20 → server enforces max_batch=10
curl -s 'http://localhost:3201/priority/process?batch=20' | jq .
# → {"processed":0,"limitError":"exceeded maxrequestbatch of 10",...}

# Within limits → success
curl -s 'http://localhost:3201/priority/process?batch=5' | jq .
# → {"processed":5,"items":[...]}
```

The response always includes `consumerLimits` showing the enforced caps.

### 5. List Subjects

```sh
# Populate stream
nats pub plain "msg" >/dev/null
nats pub greater.A.B "msg" >/dev/null
nats pub greater.A.C "msg" >/dev/null
nats pub star.x "msg" >/dev/null

# List all
curl -s 'http://localhost:3201/streams/SUBJECTS/subjects?filter=>' | jq .
# → {"subjects":{"plain":1,"greater.A.B":1,"greater.A.C":1,"star.x":1}}

# Filter
curl -s 'http://localhost:3201/streams/SUBJECTS/subjects?filter=greater.>' | jq .
# → {"subjects":{"greater.A.B":1,"greater.A.C":1}}
```

### 6. Stream Info

```sh
curl -s http://localhost:3201/streams/EVENTS/info | jq .
curl -s http://localhost:3201/streams/JOBS/info | jq .
curl -s http://localhost:3201/streams/PRIORITY/info | jq .
```

---

## 🚀 Run — Subject-Mapped Partitions

Different server config required: maps `events.*` → `events.<key>.<partition>`.

```sh
# 1. Stop plain server, start partition-aware server
pkill -f "nats-server -js" 2>/dev/null
nats-server -c server-partitions.conf &

# 2. Provision with PARTITIONS=1 — replaces EVENTS with PARTITION-0..4
NATS_USER=app NATS_PASS=app PARTITIONS=1 npm run provision

# 3. Start app with app-account credentials
NATS_USER=app NATS_PASS=app npm start

# 4. Publish — server transparently routes to partition based on key hash
curl -X POST http://localhost:3201/partitioned-events \
  -H 'content-type: application/json' \
  -d '{"key":"order","data":{"id":1}}'
# → {"originalSubject":"events.order","seq":1}

# 5. Verify deterministic mapping via natscli
nats server mapping "events.*" "events.{{wildcard(1)}}.{{partition(5,1)}}" "events.order"
# → events.order.1     ← always partition 1 for "order"

# 6. Drain partition that received the message
curl -s 'http://localhost:3201/partitions/1/process' | jq .
# → {"partition":1,"stream":"PARTITION-1","processed":1,"items":[{"seq":1,"subject":"events.order.1"}]}
```

**Verified deterministic distribution:**

| Key | Partition |
|-----|-----------|
| `order` | 1 |
| `user` | 2 |
| `session` | 3 |
| `customer` | 3 |
| `widget` | 1 |

Same key → same partition every time, even after server restart.

---

## 📂 Code map

```
.
├── README.md
├── package.json                ← scripts: build, provision, start
├── tsconfig.json
├── server.conf                 ← (unused — uses default `nats-server -js`)
├── server-partitions.conf      ← Subject-Mapped Partitions config (separate server)
├── bin/
│   └── provision.ts            ← Idempotent stream + consumer creation
└── src/
    ├── application.ts          ← LB4 wiring
    ├── index.ts                ← bootstrap (port 3201)
    ├── sequence.ts
    └── controllers/
        └── jetstream.controller.ts   ← All endpoints in one file (12 routes)
```

### Streams provisioned

| Stream | Retention | Subjects | Consumer | Consumer Limits |
|--------|-----------|----------|----------|-----------------|
| EVENTS | Limits | `events.>` | event-processor | none |
| ORDERS | Interest | `orders.>` | order-validator | none |
| JOBS | WorkQueue | `jobs.>` | job-worker | none |
| SUBJECTS | Limits | `plain`, `greater.>`, `star.*` | — | for list-subjects demo |
| PRIORITY | Limits | `priority.>` | priority-limited | `max_ack_pending=5`, `max_batch=10`, `max_waiting=100`, `max_expires=30s`, `max_bytes=1MB` |
| PARTITION-0..4 | Limits | `events.*.0..events.*.4` | partition-consumer | only when PARTITIONS=1 |

---

## 🔗 Links
- [Background docs](../../../docs/natsbyexample/) — `jetstream-*.md` (10 files)
- [natsbyexample category page ↗](https://natsbyexample.com/#jetstream)
- [JetStream concepts ↗](https://docs.nats.io/nats-concepts/jetstream)
