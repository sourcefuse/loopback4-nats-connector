<a href="https://sourcefuse.github.io/arc-docs/arc-api-docs" target="_blank"><img src="https://github.com/sourcefuse/loopback4-microservice-catalog/blob/master/docs/assets/logo-dark-bg.png?raw=true" alt="ARC By SourceFuse logo" title="ARC By SourceFuse" align="right" width="150" /></a>

# [loopback4-nats-connector](https://github.com/sourcefuse/loopback4-nats-connector)

<p align="left">
<a href="https://www.npmjs.com/package/loopback4-nats-connector">
<img src="https://img.shields.io/npm/v/loopback4-nats-connector.svg" alt="npm version" />
</a>
<a href="https://sonarcloud.io/summary/new_code?id=sourcefuse_loopback4-nats-connector" target="_blank">
<img alt="Sonar Quality Gate" src="https://img.shields.io/sonar/quality_gate/sourcefuse_loopback4-nats-connector?server=https%3A%2F%2Fsonarcloud.io">
</a>
<a href="https://github.com/sourcefuse/loopback4-nats-connector/graphs/contributors" target="_blank">
<img alt="GitHub contributors" src="https://img.shields.io/github/contributors/sourcefuse/loopback4-nats-connector?">
</a>
<a href="https://www.npmjs.com/package/loopback4-nats-connector" target="_blank">
<img alt="downloads" src="https://img.shields.io/npm/dw/loopback4-nats-connector.svg">
</a>
<a href="https://github.com/sourcefuse/loopback4-nats-connector/blob/main/LICENSE">
<img src="https://img.shields.io/github/license/sourcefuse/loopback4-nats-connector.svg" alt="License" />
</a>
<a href="https://loopback.io/" target="_blank">
<img alt="Powered By LoopBack 4" src="https://img.shields.io/badge/Powered%20by-LoopBack 4-brightgreen" />
</a>
</p>

## Overview

A [LoopBack 4](https://loopback.io/doc/en/lb4/) extension that exposes
[NATS](https://nats.io/) to LB4 applications as an injectable component.
Decorate controller methods with `@subscribe` / `@reply`, inject a
`NatsPublisher`, and configure one or more isolated named connections.

> **Status: v2 (JetStream) implemented; preparing `0.2.0` for npm publish.** v1 (`0.1.0`) surface unchanged — v2 is purely additive.
> Source under `src/` is functional and tested. **Sixteen** runnable examples under [`examples/`](./examples/) exercise the full v1 + v2 surface against real `nats-server` instances. v3 (clustering, metrics, NATS Services API) is the next milestone — see [`docs/plan/13-kanban.md`](./docs/plan/13-kanban.md).

## Roadmap at a glance

| Version | Surface                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **v1**  | Pub/Sub, Request/Reply, subject hierarchy + wildcards, queue groups, auth (TLS / user-pass / token / NKEYS), TLS encryption, connection management, multi-connection isolation, pluggable codec, status events.                                                                                                                                                                                              |
| **v2**  | JetStream: persistent streams, **`@jsConsume` push consumers** (autoAck + manual ack/nak/term/inProgress), durable subscriptions, **consumer offset tracking via `JsContext.meta`**, **`deliverPolicy` replay (`all`/`last`/`new`/`lastPerSubject`/`byStartSequence`/`byStartTime`)**, **`filterSubject` narrowing**, max-delivery cap, **`JetStreamKvRepository<T>`** base class. **Implemented in 0.2.0.** |
| **v3**  | Clustering surface, monitoring/metrics endpoint, NATS Services API.                                                                                                                                                                                                                                                                                                                                          |

Full feature scope per version: [`docs/plan/01-scope.md`](./docs/plan/01-scope.md).

## Installation

Once published (target: `0.1.0`):

```sh
npm install loopback-nats-connector
```

## Basic usage (v1, single connection)

```ts
import {BootMixin} from '@loopback/boot';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication} from '@loopback/rest';
import {ServiceMixin} from '@loopback/service-proxy';
import {
  NatsConnectorComponent,
  NatsConnectorComponentBindings,
} from 'loopback-nats-connector';

export class MyApp extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    this.configure(NatsConnectorComponentBindings.COMPONENT).to({
      servers: ['nats://localhost:4222'],
      auth: {token: process.env.NATS_TOKEN!},
    });
    this.component(NatsConnectorComponent);

    this.controller(HelloController);
  }
}
```

```ts
import {inject} from '@loopback/core';
import {
  subscribe,
  reply,
  NatsPublisher,
  NatsConnectorComponentBindings as N,
  type SubscriptionContext,
} from 'loopback-nats-connector';

export class HelloController {
  constructor(@inject(N.PUBLISHER) private publisher: NatsPublisher) {}

  @subscribe('hello.*')
  async greet(payload: {name: string}, ctx: SubscriptionContext) {
    await this.publisher.publish('audit', {
      greeted: payload.name,
      at: Date.now(),
    });
  }

  @reply('hello.health')
  async health() {
    return {ok: true};
  }
}
```

> **Default connection.** Decorators with no `connection` option
> resolve via this rule: (1) `default: '<name>'` field on options,
> else (2) connection literally named `'default'`, else (3) boot
> fails. Flat shorthand auto-satisfies rule 2. For multi-connection
> with no obvious primary, set `default: '<name>'` or pass
> `{connection: '<name>'}` on every decorator.
> Details: [09 §named-connection model](./docs/plan/09-multi-connection.md).

## Multiple isolated connections

A single application can talk to several NATS servers, each fully
isolated (separate auth, codec, status emitter, subscription handles):

```ts
this.configure(NatsConnectorComponentBindings.COMPONENT).to({
  connections: {
    default: {
      servers: ['nats://internal-broker:4222'],
      auth: {token: process.env.INTERNAL_NATS_TOKEN!},
    },
    ingress: {
      servers: ['nats://public-broker:4222'],
      auth: {
        tls: {
          certFile: '/secrets/ingress.crt',
          keyFile: '/secrets/ingress.key',
        },
      },
    },
  },
});
```

Then route subscriptions to a specific connection:

```ts
@subscribe('public.>', {connection: 'ingress'})
async fanIn(payload: unknown, ctx) { /* … */ }
```

Inject a publisher for a named connection:

```ts
constructor(
  @inject(N.publisher('ingress')) private outbound: NatsPublisher,
  @inject(N.publisher('default')) private internal: NatsPublisher,
) {}
```

Full named-connection model and isolation guarantees:
[`docs/plan/09-multi-connection.md`](./docs/plan/09-multi-connection.md).

## Per-tenant dynamic connections (v1.x)

Open / close NATS connections at runtime — one per tenant — and let
shared handlers follow the fleet via `connection: '*'`:

```ts
import {inject} from '@loopback/core';
import {
  NatsConnectionRegistry,
  NatsConnectorComponentBindings as N,
  subscribe,
  type SubscriptionContext,
} from 'loopback-nats-connector';

class OnboardingService {
  constructor(@inject(N.REGISTRY) private nats: NatsConnectionRegistry) {}
  async onTenantCreated(t: {id: string; natsUrl: string; natsToken: string}) {
    await this.nats.add(t.id, {
      servers: [t.natsUrl],
      auth: {token: t.natsToken},
    });
  }
}

class FleetController {
  @subscribe('orders.created', {connection: '*'})
  async onOrder(payload: unknown, ctx: SubscriptionContext) {
    const tenantId = ctx.connection; // tenant ID = connection name
    /* ... */
  }
}
```

Race window, scaling limits, anti-patterns:
[`docs/plan/11-dynamic-connections.md`](./docs/plan/11-dynamic-connections.md).

## Dynamic connections & limitations

When subscriptions target a connection added via `registry.add()` **after**
`app.start()`, the decorator **must** use `connection: '*'`.

`SubscriptionBooter.start()` calls `resolveConnectionName()` for every
non-wildcard decorator. If the requested name is not in the static
`connections` map **and** not already in the registry at boot time, it
throws and the app never starts:

```
[nats] subscription on 'orders.created' targets unknown connection 'tenant1'
```

The `connection: '*'` path avoids this: decorators are stored as templates
during `start()` and materialised per-connection each time
`registry.add(name, opts)` fires.

| Scenario                            | `connection` value | Works?        |
| ----------------------------------- | ------------------ | ------------- |
| Static connection in config         | `'myconn'`         | ✅            |
| Dynamic, added before `app.start()` | `'tenant1'`        | ✅            |
| Dynamic, added after `app.start()`  | `'tenant1'`        | ❌ boot error |
| Dynamic, added after `app.start()`  | `'*'`              | ✅            |

Reference implementation: [`examples/03-multi-tenant-dynamic/`](./examples/03-multi-tenant-dynamic/).

## Examples

Runnable LB4 apps under [`examples/`](./examples/) — one per
configuration (single connection, multi-connection static, multi-tenant
dynamic, mTLS auth, NKEY auth, custom codec, queue groups, status
events, JetStream consumer, KV repository, services API). Each
example spawns its own `nats-server` and is the project's end-to-end
test layer.

```sh
npm run examples         # build + run every example against spawned nats-server
```

Layout and conventions: [docs/plan/12-examples.md](./docs/plan/12-examples.md).

## Documentation

The complete design specification lives in [`docs/plan/`](./docs/plan/):

- [01-scope.md](./docs/plan/01-scope.md) — feature surface per version
- [02-architecture.md](./docs/plan/02-architecture.md) — NATS → LB4 mapping
- [03-file-structure.md](./docs/plan/03-file-structure.md) — file layout, call graph
- [04-public-api.md](./docs/plan/04-public-api.md) — consumer-facing API contract
- [05-internals.md](./docs/plan/05-internals.md) — module internals
- [06-lifecycle.md](./docs/plan/06-lifecycle.md) — start/stop semantics
- [07-testing.md](./docs/plan/07-testing.md) — testing strategy
- [08-roadmap.md](./docs/plan/08-roadmap.md) — v2/v3 design sketches
- [09-multi-connection.md](./docs/plan/09-multi-connection.md) — multi-connection model
- [10-publishing.md](./docs/plan/10-publishing.md) — npm publishing plan
- [11-dynamic-connections.md](./docs/plan/11-dynamic-connections.md) — runtime per-tenant registry + `connection: '*'` templates
- [12-examples.md](./docs/plan/12-examples.md) — runnable examples layout

### Find what you need

| Need                                | Doc                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Named / multiple connections        | [09](./docs/plan/09-multi-connection.md)                                                |
| Per-tenant connections at runtime   | [11](./docs/plan/11-dynamic-connections.md)                                             |
| Swap default JSON codec             | [04 §`Codec<T>`](./docs/plan/04-public-api.md)                                          |
| Set / read `MsgHdrs`                | [04 §Header construction](./docs/plan/04-public-api.md)                                 |
| Raw `NatsConnection` escape hatch   | [04 §Raw connection escape hatch](./docs/plan/04-public-api.md)                         |
| Disconnect / reconnect events       | [06 §Status event taxonomy](./docs/plan/06-lifecycle.md)                                |
| JetStream consumer (v2)             | [04 §`@jsConsume`](./docs/plan/04-public-api.md), [08 §2.1](./docs/plan/08-roadmap.md)  |
| `requestMany` (v3, v1 escape hatch) | [04 §`requestMany`](./docs/plan/04-public-api.md), [08 §3.3](./docs/plan/08-roadmap.md) |

## Imports cheat sheet

Everything imports from the package root. Never import from `nats` directly —
the extension re-exports the nats.js types/factories you need so consumers
debug against nats.js docs without contract drift.

```ts
import {
  // component
  NatsConnectorComponent,
  NatsConnectorComponentBindings, // also exported as `N` alias in examples below
  // decorators (v1)
  subscribe,
  queueSubscribe,
  reply,
  // service
  NatsPublisher,
  // header factory + type (re-exported from nats.js)
  headers,
  type MsgHdrs,
  // raw connection type for escape hatch
  type NatsConnection,
  // handler context
  type SubscriptionContext,
  // dynamic registry (v1.x)
  NatsConnectionRegistry,
  // codec contract
  type Codec,
} from 'loopback-nats-connector';
```

## Troubleshooting

First-failure debugging path. Symptom on the left, where to look on the right.

| Symptom                                                                 | Look at                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boot rejects: `cannot resolve N.connection('default')`                  | No connection named `default`. Either rename one in `connections`, or pass `{connection: '<name>'}` on every decorator. See [09 §named-connection model](./docs/plan/09-multi-connection.md). |
| Boot rejects naming a decorator + connection                            | Decorator references unknown connection name. Fix the name in the `@subscribe` opts or add the connection to options. [06 §Failure modes](./docs/plan/06-lifecycle.md).                       |
| Disconnects, reconnect noise, slow consumer                             | Subscribe to per-connection emitter at `N.events('<name>')`. Full event list + payloads: [06 §Status event taxonomy](./docs/plan/06-lifecycle.md).                                            |
| `request()` rejects with `code: '503'`                                  | No responder for subject (nats.js behavior, surfaced unchanged). Check subscriber registered, broker reachable, subject typo. [04 §`NatsPublisher`](./docs/plan/04-public-api.md).            |
| Need a nats.js method missing from `NatsPublisher` (e.g. `requestMany`) | Inject raw `NatsConnection` at `N.CONNECTION`. [04 §Raw connection escape hatch](./docs/plan/04-public-api.md).                                                                               |
| `headers()` import not found                                            | Re-exported from package root: `import {headers} from 'loopback-nats-connector'`. Do not import from `nats`.                                                                                  |
| Multi-tenant: messages published in onboarding race window lost         | Documented behavior on core NATS. Mitigation options: [11 §Race window](./docs/plan/11-dynamic-connections.md).                                                                               |
| Codec decode fails on inbound                                           | Raw bytes available on `ctx.raw`. [05 §error propagation](./docs/plan/05-internals.md).                                                                                                       |
| One connection failed at boot, others fine                              | Intentional. Subscriptions targeting the failed name raise loudly during booter pass. [06 §Failure modes](./docs/plan/06-lifecycle.md).                                                       |

## Requirements

- Node.js `20 || 22 || 24`
- `@loopback/core ^7.0.11` (peer dependency)
- A reachable NATS server (e.g. via the `nats-server` binary in your
  devcontainer or a managed broker)

## Development

See [DEVELOPING.md](./DEVELOPING.md) for the contributor guide and
[CLAUDE.md](./CLAUDE.md) for AI-assistant guidance on the codebase.

```sh
npm run build         # tsc → dist/
npm test              # rebuild → mocha → lint
npm run lint:fix      # eslint --fix + prettier --write
```

## License

[MIT](./LICENSE) © SourceFuse
