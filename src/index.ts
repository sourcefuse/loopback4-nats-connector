/**
 * Public surface of `loopback-nats-connector`.
 *
 * DX principle: consumers import everything from this package root —
 * never from `nats` directly. Same nats.js types under the hood, no
 * translation layer. See docs/plan/04-public-api.md §Import discipline.
 */

// Component + bindings
export * from './component';
export * from './keys';

// Public types
export * from './types';

// Services
export {NatsPublisher} from './services/nats-publisher.service';
export {
  NatsConnectionRegistry,
  type Disposable,
  type RegistryHandler,
} from './services/connection-registry.service';

// Default codec (consumers may extend / re-bind)
export {JsonCodec} from './providers/codec.provider';

// nats.js re-exports — import these from package root, not from `nats`
export {headers} from '@nats-io/nats-core';
export type {MsgHdrs, NatsConnection} from '@nats-io/nats-core';
export type {JetStreamClient} from '@nats-io/jetstream';

// Decorators
export {subscribe, queueSubscribe} from './decorators/subscribe.decorator';
export {reply} from './decorators/reply.decorator';
export {jsConsume} from './decorators/js-consume.decorator';

// Repositories (v2)
export {JetStreamKvRepository} from './repositories/jetstream-kv.repository';
