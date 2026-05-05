/**
 * `@subscribe` and `@queueSubscribe` decorators.
 *
 * Decorator only writes metadata — never resolves LB4 context, never
 * touches nats.js, never opens sockets. The `SubscriptionBooter` reads
 * the metadata at startup and creates the actual NATS subscription.
 *
 * See:
 *   - docs/plan/04-public-api.md §Decorators
 *   - docs/plan/05-internals.md  §Decorators
 */
import {MethodDecoratorFactory} from '@loopback/metadata';
import {NatsConnectorComponentBindings as N} from '../keys';
import type {SubscribeOptions, SubscriptionMetadata} from '../types';

/**
 * Subscribe a controller method to a NATS subject.
 *
 * @param subject — subject pattern (supports `*` token wildcard, `>` tail wildcard)
 * @param opts — connection / queue / max / timeout / slow
 *
 * @example
 *   @subscribe('orders.*.created', {queue: 'workers'})
 *   async onCreated(payload: OrderCreated, ctx: SubscriptionContext) { ... }
 */
export function subscribe(
  subject: string,
  opts: SubscribeOptions = {},
): MethodDecorator {
  const spec: SubscriptionMetadata = {
    kind: 'subscribe',
    subject,
    queue: opts.queue,
    connection: opts.connection ?? 'default',
    options: opts,
    methodName: '', // filled by booter from MetadataInspector key
  };
  return MethodDecoratorFactory.createDecorator<SubscriptionMetadata>(
    N.SUBSCRIPTION_METADATA,
    spec,
    {decoratorName: '@subscribe'},
  );
}

/**
 * Sugar for `@subscribe(subject, {queue, ...opts})`.
 *
 * @example
 *   @queueSubscribe('jobs.process', 'workers')
 *   async onJob(job: Job) { ... }
 */
export function queueSubscribe(
  subject: string,
  queue: string,
  opts: Omit<SubscribeOptions, 'queue'> = {},
): MethodDecorator {
  return subscribe(subject, {...opts, queue});
}
