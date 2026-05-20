# `examples/live/` — natsbyexample.com Recreations

Runnable LB4 apps recreating the [natsbyexample.com](https://natsbyexample.com)
examples using `loopback-nats-connector`. Apps are organised by **category** —
matching natsbyexample.com's own structure — so navigation feels familiar.

Each category folder is a standalone LB4 app. Multiple controllers inside cover
the individual examples within that category.

---

## 📚 Categories

### 🔁 [Messaging](./messaging/) — Port 3200

> Core NATS messaging — pub/sub, request-reply, queue groups.
> [natsbyexample source ↗](https://natsbyexample.com/#messaging)

| natsbyexample example | What it shows | Where in code |
|------------------------|---------------|---------------|
| [Core Publish-Subscribe](https://natsbyexample.com/examples/messaging/pub-sub/cli) | Wildcard subjects, fan-out subscribers | [`messaging/src/controllers/pub-sub.controller.ts`](./messaging/src/controllers/pub-sub.controller.ts) |
| [Request-Reply](https://natsbyexample.com/examples/messaging/request-reply/go) | `@reply` handler + `NatsPublisher.request()` | [`messaging/src/controllers/request-reply.controller.ts`](./messaging/src/controllers/request-reply.controller.ts) |
| [JSON for Message Payloads](https://natsbyexample.com/examples/messaging/json/go) | Typed JSON via default codec | [`messaging/src/controllers/json-payload.controller.ts`](./messaging/src/controllers/json-payload.controller.ts) |
| [Concurrent Message Processing](https://natsbyexample.com/examples/messaging/concurrent/python) | Queue groups for load balancing | [`messaging/src/controllers/queue-concurrent.controller.ts`](./messaging/src/controllers/queue-concurrent.controller.ts) |
| [Iterating Multiple Subscriptions](https://natsbyexample.com/examples/messaging/iterating-multiple-subscriptions/rust) | Multiple `@subscribe` in one controller | [`messaging/src/controllers/queue-concurrent.controller.ts`](./messaging/src/controllers/queue-concurrent.controller.ts) |
| Protobuf for Message Payloads | (skipped — external dep) | [`docs/natsbyexample/messaging-protobuf.md`](../../docs/natsbyexample/messaging-protobuf.md) |

📖 **Full details:** [`messaging/README.md`](./messaging/README.md)

---

### 🌊 [JetStream](./jetstream/) — Port 3201

> Persistent streams, durable consumers, ack semantics.
> [natsbyexample source ↗](https://natsbyexample.com/#jetstream)

| natsbyexample example | What it shows | Where in code |
|------------------------|---------------|---------------|
| [Limits-based Stream](https://natsbyexample.com/examples/jetstream/limits-stream/go) | Retention by msg/byte/age | [`jetstream/bin/provision.ts`](./jetstream/bin/provision.ts) (EVENTS) + `POST /events` |
| [Interest-based Stream](https://natsbyexample.com/examples/jetstream/interest-stream/go) | Retain only while consumer interested | provision (ORDERS) + `POST /orders` |
| [Work-queue Stream](https://natsbyexample.com/examples/jetstream/workqueue-stream/go) | Each msg consumed exactly once | provision (JOBS) + `POST /jobs` |
| [Pull Consumer](https://natsbyexample.com/examples/jetstream/pull-consumer/go) | `consumer.fetch({batch})` / `consumer.next()` | [`jetstream/src/controllers/jetstream.controller.ts`](./jetstream/src/controllers/jetstream.controller.ts) |
| [Pull Consumer - Applying Limits](https://natsbyexample.com/examples/jetstream/pull-consumer-limits/go) | Server enforces `max_ack_pending`, `max_batch`, `max_waiting`, `max_bytes` | provision (PRIORITY) + `GET /priority/process` |
| [Migration to new JetStream API](https://natsbyexample.com/examples/jetstream/api-migration/go) | All endpoints use modern API (no legacy `Subscribe()`) | jetstream.controller.ts (entire file) |
| [Consumer - Fetch Messages](https://natsbyexample.com/examples/jetstream/consumer-fetch-messages/java) | Batch fetch + single next variants | jetstream.controller.ts |
| [Confirmed Message Ack](https://natsbyexample.com/examples/jetstream/ack-ack/go) | `msg.ackAck()` waits for server confirmation | `GET /orders/process` |
| [List Subjects](https://natsbyexample.com/examples/jetstream/list-subjects/go) | `stream.info({subjects_filter})` | `GET /streams/{name}/subjects` |
| [Subject-Mapped Partitions](https://natsbyexample.com/examples/jetstream/partitions/cli) | Server-side mapping → N partition streams | [`jetstream/server-partitions.conf`](./jetstream/server-partitions.conf) + `POST /partitioned-events` |
| Push Consumers (legacy) | (skipped — modern pull API replaces) | — |
| Queue Push Consumers (legacy) | (skipped) | — |
| Multi-Stream Consumption (legacy) | (skipped) | — |

📖 **Full details:** [`jetstream/README.md`](./jetstream/README.md)

---

### 🗝️ [Key-Value](./kv/) — Port 3202

> Layer on top of JetStream for KV operations.
> [natsbyexample source ↗](https://natsbyexample.com/#key-value)

| natsbyexample example | What it shows | Where in code |
|------------------------|---------------|---------------|
| [Key-Value Intro](https://natsbyexample.com/examples/kv/intro/go) | `JetStreamKvRepository<T>` — typed put/get/delete | [`kv/src/repositories/config.repository.ts`](./kv/src/repositories/config.repository.ts) + [`kv/src/controllers/config.controller.ts`](./kv/src/controllers/config.controller.ts) |

📖 **Full details:** [`kv/README.md`](./kv/README.md)

---

### 📦 [Object Store](./object-store/) — Port 3203

> Chunked file storage on JetStream.
> [natsbyexample source ↗](https://natsbyexample.com/#object-store)

| natsbyexample example | What it shows | Where in code |
|------------------------|---------------|---------------|
| [Object-Store Intro](https://natsbyexample.com/examples/os/intro/python) | `@nats-io/obj` chunked file put/get/list/info/delete | [`object-store/src/services/file-storage.service.ts`](./object-store/src/services/file-storage.service.ts) + [`object-store/src/controllers/files.controller.ts`](./object-store/src/controllers/files.controller.ts) |

📖 **Full details:** [`object-store/README.md`](./object-store/README.md)

---

### 🔐 [Authentication & Authorization](./auth/) — Port 3204

> Every NATS auth mode — token, user/pass, mTLS, NKey, JWT, callout, accounts.
> [natsbyexample source ↗](https://natsbyexample.com/#authentication-and-authorization)

| Auth mode | Server config | What it shows |
|-----------|---------------|---------------|
| Token | [`auth/server-token.conf`](./auth/server-token.conf) | `auth: {token: '...'}` |
| User/Password | [`auth/server-userpass.conf`](./auth/server-userpass.conf) | `auth: {user, pass}` |
| TLS / mTLS | [`auth/server-tls.conf`](./auth/server-tls.conf) + [`auth/tls/gen-certs.sh`](./auth/tls/gen-certs.sh) | `auth: {tls: {certFile, keyFile, caFile}}` |
| NKey | server.conf with `nkey: U…` | `auth: {nkey: {seed}}` |
| JWT (decentralized) | nsc-resolver server | `auth: {jwt: {jwt, seed}}` |
| Authorization permissions | [`auth/server-permissions.conf`](./auth/server-permissions.conf) | server-side, client transparent |
| Private Inbox | [`auth/server-private-inbox.conf`](./auth/server-private-inbox.conf) | `allow_responses` pattern |
| Multi-tenancy / Accounts | [`auth/server-accounts.conf`](./auth/server-accounts.conf) | `exports`/`imports` between accounts |
| System Account ($SYS) | [`auth/server-sys-account.conf`](./auth/server-sys-account.conf) | sys account monitoring |
| **Auth Callout** (centralized) | [`auth/server-callout.conf`](./auth/server-callout.conf) + [`auth/bin/callout-service.ts`](./auth/bin/callout-service.ts) | callout service issues JWTs |
| Auth Callout (decentralized) | nsc edit authcallout | architecture doc only |

| natsbyexample example | Where covered |
|------------------------|---------------|
| [Programmatic NKeys & JWTs](https://natsbyexample.com/examples/auth/nkeys-jwts/go) | NKey + JWT modes |
| [Configuring System Account](https://natsbyexample.com/examples/auth/sys-account/cli) | `server-sys-account.conf` |
| [Private Inbox](https://natsbyexample.com/examples/auth/private-inbox/cli) | `server-private-inbox.conf` |
| [Auth Callout - Centralized](https://natsbyexample.com/examples/auth/callout/cli) | `server-callout.conf` + callout-service.ts |
| [Auth Callout - Decentralized](https://natsbyexample.com/examples/auth/callout-decentralized/cli) | architecture doc |
| [Private Inbox using JWT](https://natsbyexample.com/examples/auth/private-inbox-jwt/cli) | combines JWT + private-inbox configs |

📖 **Full details:** [`auth/README.md`](./auth/README.md)

---

## 🚫 Skipped Categories

These categories are intentionally not implemented:

| Category | Reason |
|----------|--------|
| **Topologies** (clusters, leaf nodes, gateways, superclusters) | Connector-side configs only — see [`docs/natsbyexample/topology-*.md`](../../docs/natsbyexample/) |
| **Use Cases** | Application-level patterns, not connector features |
| **Integrations** | Out of scope for this connector |
| **Services Framework** | Server-side micro-services, not client SDK |
| **Embedded** | NATS embedded in custom binary, not LB4 use case |
| **Operations** | Server admin, not connector |
| **Legacy examples** (legacy `Subscribe()`, push consumers, queue-push, multi-stream) | Modern API used throughout |

---

## ⚡ Quick Start

```sh
# 1. Build the connector itself (one time)
cd /workspaces/loopback-nats-connector
npm install && npm run build

# 2. Build all live example apps
for d in examples/live/*/; do
  (cd "$d" && npm install --prefer-offline && npm run build)
done

# 3. Start NATS server (most categories need JetStream)
nats-server -js &

# 4. Pick a category and follow its README
cd examples/live/messaging  &&  cat README.md   # then:  npm start
```

| Category | Server cmd | Provision step | Run |
|----------|-----------|----------------|-----|
| messaging | `nats-server` | none | `npm start` |
| jetstream | `nats-server -js` | `npm run provision` | `npm start` |
| kv | `nats-server -js` | `npm run provision` | `npm start` |
| object-store | `nats-server -js` | none (auto-creates bucket) | `npm start` |
| auth | varies — `nats-server -c server-<mode>.conf` | varies — see auth/README.md | `npm run start:<mode>` |

---

## 📂 Code Layout (per category)

```
examples/live/<category>/
├── README.md                  ← detailed per-category walkthrough
├── package.json
├── tsconfig.json
├── server.conf                ← (or server-<mode>.conf for auth)
├── bin/                       ← provision scripts (jetstream, kv, auth)
└── src/
    ├── application.ts         ← LB4 app wiring
    ├── index.ts               ← bootstrap
    ├── sequence.ts
    ├── controllers/           ← one .controller.ts per natsbyexample example
    ├── repositories/          ← (kv only) JetStreamKvRepository<T> subclass
    └── services/              ← (object-store only) FileStorageService
```

---

## 📖 Background reading

For each natsbyexample example, the source-level walkthrough lives in
[`docs/natsbyexample/`](../../docs/natsbyexample/) — 33 markdown files
explaining concepts, code patterns, and connector usage in detail.

The implementation status matrix is in
[`docs/natsbyexample/TASK_LIST.md`](../../docs/natsbyexample/TASK_LIST.md).
