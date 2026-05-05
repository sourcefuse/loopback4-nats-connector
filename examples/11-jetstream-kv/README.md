# 11 — jetstream-kv

`JetStreamKvRepository<T>` exposed via REST endpoints. Bucket auto-created on first PUT.

## Ports

- NATS: `4222` (JetStream)
- REST: `3011`

## Run

**Terminal 1** — broker:
```sh
nats-server -c server.conf
```

**Terminal 2** — app:
```sh
npm install
npm run build
npm start
```

**Terminal 3** — KV ops via curl:
```sh
# put — auto-creates bucket on first call
curl -X PUT http://localhost:3011/flags/checkout-v2 \
     -H 'content-type: application/json' \
     -d '{"enabled":true,"rolloutPct":50}'

# get
curl http://localhost:3011/flags/checkout-v2

# delete
curl -X DELETE http://localhost:3011/flags/checkout-v2

# get after delete → value: null
curl http://localhost:3011/flags/checkout-v2
```

Cross-check with `nats` CLI:
```sh
nats kv ls
nats kv get feature-flags checkout-v2
```

## Files

- `server.conf` — JetStream-enabled broker, store_dir `./js-store/` (gitignored).
- `src/repositories/flags.repository.ts` — `extends JetStreamKvRepository<FeatureFlag>`.
- `src/controllers/flags.controller.ts` — REST CRUD endpoints.
- `src/application.ts` — `KvApp` registering NATS component + repo.
- `src/index.ts` — boots app on port 3011.

## Prereqs

`nats-server` + `nats` CLI.
