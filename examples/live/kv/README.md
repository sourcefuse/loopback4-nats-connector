# 🗝️ Key-Value — natsbyexample.com Recreations

> NATS Key-Value store via `JetStreamKvRepository<T>`.
> LB4 app on **port 3202**. KV = layer over JetStream stream `KV_<bucket>`.

| natsbyexample example | What it shows | Code |
|------------------------|---------------|------|
| [Key-Value Intro](https://natsbyexample.com/examples/kv/intro/go) | Typed bucket put/get/delete; KV bucket = JetStream stream `KV_config` with subjects `$KV.config.>` | [`src/repositories/config.repository.ts`](./src/repositories/config.repository.ts) + [`src/controllers/config.controller.ts`](./src/controllers/config.controller.ts) |

---

## 🚀 Run

```sh
# 1. JetStream-enabled NATS server
nats-server -js &

# 2. Build, provision (creates 'config' bucket with history=5)
npm install && npm run build
npm run provision

# 3. Start app
npm start
# → REST at http://127.0.0.1:3202
```

Note: `JetStreamKvRepository` will auto-create the bucket on first PUT,
but explicit `npm run provision` lets you set `history` and other options
upfront.

---

## 🧪 Test scenarios

### 1. Put values

```sh
curl -X PUT http://localhost:3202/config/feature-x \
  -H 'content-type: application/json' \
  -d '{"value":true,"description":"enable feature X"}'
# → {"key":"feature-x","entry":{"value":true,"description":"...","updatedAt":...}}

curl -X PUT http://localhost:3202/config/max-retries \
  -H 'content-type: application/json' \
  -d '{"value":3,"description":"max retry count"}'
```

### 2. Get values

```sh
curl -s http://localhost:3202/config/feature-x | jq .
# → {"key":"feature-x","entry":{"value":true,"description":"...",...}}

# Missing key returns null entry
curl -s http://localhost:3202/config/nonexistent | jq .
# → {"key":"nonexistent","entry":null}
```

### 3. Delete (tombstone)

```sh
curl -X DELETE http://localhost:3202/config/feature-x
# → {"key":"feature-x","deleted":true}

# Subsequent GET returns null — but history is preserved
curl -s http://localhost:3202/config/feature-x | jq .
# → {"key":"feature-x","entry":null}
```

### 4. natscli inspection

```sh
# Direct KV access
nats kv get config feature-x
nats kv put config feature-y true
nats kv ls config
nats kv history config feature-x      # shows revisions including DELETE

# Underlying JetStream stream
nats stream info KV_config
nats stream view KV_config            # shows raw KV operations
```

---

## 📂 Code map

```
.
├── README.md
├── package.json                ← scripts: build, provision, start
├── tsconfig.json
├── server.conf                 ← (unused — uses default JS server)
├── bin/
│   └── provision.ts            ← Creates 'config' bucket via @nats-io/kv Kvm
└── src/
    ├── application.ts          ← Binds repositories.ConfigRepository
    ├── index.ts                ← bootstrap (port 3202)
    ├── sequence.ts
    ├── repositories/
    │   └── config.repository.ts    ← extends JetStreamKvRepository<ConfigEntry>
    └── controllers/
        └── config.controller.ts    ← REST: GET/PUT/DELETE /config/{key}
```

### Repository pattern

```ts
import {JetStreamKvRepository, NatsConnectorComponentBindings as N, type Codec, type JetStreamClient} from 'loopback-nats-connector';

export interface ConfigEntry { value: unknown; description?: string; updatedAt?: number }

export class ConfigRepository extends JetStreamKvRepository<ConfigEntry> {
  constructor(
    @inject(N.JETSTREAM) js: JetStreamClient,
    @inject(N.CODEC) codec: Codec<unknown>,
  ) {
    super(js, codec, {bucket: 'config'});
  }
}
```

Provided methods (from base class):
- `get(key)` → `T | undefined`
- `put(key, value)` → `Promise<void>`
- `delete(key)` → soft delete (tombstone)
- `watch(prefix?)` → AsyncIterable<{key, value}>

---

## 🔗 Links
- [Background docs](../../../docs/natsbyexample/kv-intro.md)
- [natsbyexample KV ↗](https://natsbyexample.com/examples/kv/intro/go)
- [JetStream KV concepts ↗](https://docs.nats.io/nats-concepts/jetstream/key-value-store)
