# 🔁 Messaging — natsbyexample.com Recreations

> Core NATS messaging patterns: pub/sub, request-reply, JSON payloads, queue groups.
> Single LB4 app on **port 3200** demonstrating all 5 examples.

| natsbyexample example | What it shows | Code |
|------------------------|---------------|------|
| [Core Publish-Subscribe](https://natsbyexample.com/examples/messaging/pub-sub/cli) | Wildcard subjects (`events.>`, `news.*`), fan-out to multiple subscribers | [`src/controllers/pub-sub.controller.ts`](./src/controllers/pub-sub.controller.ts) |
| [Request-Reply](https://natsbyexample.com/examples/messaging/request-reply/go) | `@reply` handler responds to NATS requests; `NatsPublisher.request()` for client side | [`src/controllers/request-reply.controller.ts`](./src/controllers/request-reply.controller.ts) |
| [JSON for Message Payloads](https://natsbyexample.com/examples/messaging/json/go) | Default JSON codec serialises typed objects automatically | [`src/controllers/json-payload.controller.ts`](./src/controllers/json-payload.controller.ts) |
| [Concurrent Message Processing](https://natsbyexample.com/examples/messaging/concurrent/python) | Queue group `tasks.work [queue=workers]` — load balanced across instances | [`src/controllers/queue-concurrent.controller.ts`](./src/controllers/queue-concurrent.controller.ts) |
| [Iterating Multiple Subscriptions](https://natsbyexample.com/examples/messaging/iterating-multiple-subscriptions/rust) | Multiple `@subscribe` decorators in same controller | [`src/controllers/queue-concurrent.controller.ts`](./src/controllers/queue-concurrent.controller.ts) |

---

## 🚀 Run

```sh
# 1. Start NATS server (no JetStream needed)
nats-server &

# 2. Build + start app
npm install && npm run build && npm start
# Output: REST at http://127.0.0.1:3200
```

App boots, connects to NATS, registers all `@subscribe` and `@reply` handlers
on the broker. Stays running and prints log lines as messages arrive.

---

## 🧪 Test scenarios

### 1. Core Publish-Subscribe

App subscribes to `events.>` (wildcard) and `news.*` (single-token).

```sh
nats pub events.user.login '{"user":"alice"}'
nats pub events.order.placed '{"orderId":"o-1","total":99}'
nats pub news.tech '{"headline":"NATS 2.10 released"}'
```

**Expected app log:**
```
[pub-sub] events.> on events.user.login: {"user":"alice"}
[pub-sub] events.> on events.order.placed: {"orderId":"o-1","total":99}
[pub-sub] news.* on news.tech: {"headline":"NATS 2.10 released"}
```

REST publish endpoint:
```sh
curl -X POST http://localhost:3200/publish \
  -H 'content-type: application/json' \
  -d '{"subject":"events.api.call","payload":{"endpoint":"/health"}}'
```

### 2. Request-Reply

App registers `@reply` handlers for `time.now` and `math.calc`.

```sh
# Direct via natscli
nats request time.now '' --timeout=2s
# → {"ts":...,"iso":"2026-...","server":"messaging"}

nats request math.calc '{"a":10,"b":5,"op":"add"}' --timeout=2s
# → {"result":15}

# Via REST (app makes NATS request internally)
curl -s http://localhost:3200/time
curl -s 'http://localhost:3200/calc?a=10&b=5&op=mul'
```

### 3. JSON Payload

App `@subscribe('data.orders')` and `@reply('order.validate')` accept typed
`Order` objects directly — codec handles encode/decode.

```sh
nats pub data.orders '{"orderId":"o-1","amount":99.99,"currency":"USD","items":["A","B"]}'

nats request order.validate '{"orderId":"o-2","amount":49.99}' --timeout=2s
# → {"orderId":"o-2","accepted":true,"ts":...}

curl -X POST http://localhost:3200/orders \
  -H 'content-type: application/json' \
  -d '{"orderId":"o-3","amount":200,"currency":"GBP"}'
```

### 4. Queue Groups + Concurrent Processing

Queue group `workers` = each message delivered to ONE handler in the group.
Run multiple app instances on different ports — NATS distributes between them.

```sh
# Single instance
nats pub tasks.work '{"taskId":"t-1","type":"email"}'

# Burst test
for i in $(seq 1 10); do
  nats pub tasks.work "{\"taskId\":\"t-$i\",\"type\":\"job\"}"
done

# Broadcast (no queue group)
nats pub tasks.notify '{"taskId":"t-9","type":"alert"}'
```

**Expected app log:**
```
[queue] #1 tasks.work [queue=workers] taskId=t-1 type=email
[queue] #2 tasks.work [queue=workers] taskId=t-2 type=job
...
[broadcast] tasks.notify taskId=t-9 type=alert
```

Multi-instance load balancing:
```sh
PORT=3200 npm start &
PORT=3290 npm start &
for i in $(seq 1 20); do nats pub tasks.work "{\"taskId\":\"t-$i\"}"; done
# Watch — roughly 10 messages handled by each instance
```

### 5. Multiple Subscriptions

Same controller has handlers for `audit.login` AND `audit.logout` (disjoint subjects).

```sh
nats pub audit.login '{"user":"alice"}'
nats pub audit.logout '{"user":"bob"}'
```

**Expected:**
```
[multi-sub] audit.login: {"user":"alice"}
[multi-sub] audit.logout: {"user":"bob"}
```

---

## 📂 Code map

```
src/
├── application.ts             ← LB4 app: NatsConnectorComponent + boot
├── index.ts                   ← bootstrap (port 3200, nats:// localhost:4222)
├── sequence.ts                ← LB4 middleware sequence (default)
└── controllers/
    ├── pub-sub.controller.ts          ← Core Publish-Subscribe
    ├── request-reply.controller.ts    ← Request-Reply
    ├── json-payload.controller.ts     ← JSON payloads
    └── queue-concurrent.controller.ts ← Queue groups + multi-sub
```

Connector imports:
- `@subscribe('subject', {queue?})` — handler decorator
- `@reply('subject')` — request-reply handler
- `NatsPublisher` (via `@inject(N.PUBLISHER)`) — publish/request from code
- `SubscriptionContext` — handler 2nd arg with subject, headers, raw bytes

---

## 🔗 Links
- [Background docs (caveman compressed)](../../../docs/natsbyexample/messaging-pub-sub.md) — and 5 others in same folder
- [natsbyexample category page ↗](https://natsbyexample.com/#messaging)
- [NATS pub/sub concepts ↗](https://docs.nats.io/nats-concepts/core-nats/pubsub)
