# Examples

16 standalone LB4 applications exercising `loopback-nats-connector` against a real `nats-server`. Each example runs on a dedicated port and can be started independently.

## Run individually

```sh
cd examples/01-single-connection
npm install
npm run build
nats-server -c server.conf &
npm start
```

## Layout

```
examples/
├── README.md                        this file
├── run-all.sh                       install + build + start each example
└── NN-feature-name/
    ├── src/
    │   ├── application.ts           LB4 BootMixin(RestApplication) + NatsConnectorComponent
    │   ├── controllers/             feature controller(s)
    │   ├── index.ts                 main() + if (require.main === module) block
    │   └── sequence.ts
    ├── server.conf                  nats-server config for this example
    ├── package.json
    ├── tsconfig.json
    └── README.md                    run instructions + curl assertions
```

## Examples

| Dir | Feature | Port |
|-----|---------|------|
| `01-single-connection` | Basic pub/sub | 3001 |
| `02-multi-connection-static` | Static multi-connection | 3002 |
| `03-multi-tenant-dynamic` | Dynamic registry | 3003 |
| `04-auth-tls` | TLS auth | 3004 |
| `05-auth-nkey` | NKey auth | 3005 |
| `06-auth-token` | Token auth | 3006 |
| `06b-auth-userpass` | User/pass auth | 3007 |
| `07-custom-codec` | Custom codec | 3007 |
| `09-status-events` | Status events | 3009 |
| `10-jetstream-consumer` | JetStream push consumer | 3010 |
| `11-jetstream-kv` | JetStream KV repository | 3011 |
| `12-jetstream-durable` | Durable consumer | 3012 |
| `13-jetstream-manual-ack` | Manual ack | 3013 |
| `14-jetstream-deliver-policy` | Deliver policy | 3014 |
| `15-jetstream-filter-subject` | Filter subject | 3015 |
| `16-jetstream-multi-conn-isolation` | Multi-conn isolation | 3016 |

## Adding a new example

1. `lb4 app NN-feature-name` inside `examples/` (use `--skip-install`).
2. Add `NatsConnectorComponent` wiring in `src/application.ts`.
3. Write feature controller(s) and wire in `bootOptions`.
4. Add `server.conf` for the required nats-server config.
5. Set port to next available in `src/index.ts`.
6. `npm install && npm run build && nats-server -c server.conf & npm start`.

## Conventions

- One concern per example. No mixing features.
- Each example is a real LB4 RestApplication — no scenario harness.
- Use `PORT` env var to override default port.
- Use `NATS_URL` env var to override default `nats://localhost:4222`.
- JetStream examples have a `bin/provision.ts` + `npm run provision` for stream setup.
