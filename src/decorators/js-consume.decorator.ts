/**
 * `@jsConsume` decorator (v2) — JetStream push consumer.
 *
 * Decorator only writes metadata. The `SubscriptionBooter` reads
 * `kind: 'jsConsume'` entries at start, resolves the named connection's
 * `JetStreamClient`, and creates a push subscription via `js.subscribe`.
 *
 * See:
 *   - docs/plan/04-public-api.md §`@jsConsume`
 *   - docs/plan/05-internals.md  §subscription.observer.ts
 */
import {MethodDecoratorFactory} from '@loopback/metadata';
import {NatsConnectorComponentBindings as N} from '../keys';
import type {JsConsumeOptions, SubscriptionMetadata} from '../types';

/**
 * Consume messages from a JetStream stream via a (durable or ephemeral)
 * push consumer.
 *
 * @param stream — JetStream stream name (must already exist; provisioning is out-of-band).
 * @param consumer — durable consumer name; ephemeral if absent on the server.
 * @param opts — ack policy, deliver policy, filter subject, autoAck, etc.
 *
 * @example
 *   @jsConsume('ORDERS', 'order-archiver', {autoAck: true, deliverPolicy: 'all'})
 *   async archive(payload: OrderEvent, ctx: JsContext) { ... }
 */
export function jsConsume(
  stream: string,
  consumer: string,
  opts: JsConsumeOptions = {},
): MethodDecorator {
  const spec: SubscriptionMetadata = {
    kind: 'jsConsume',
    stream,
    consumer,
    connection: opts.connection ?? 'default',
    options: opts,
    methodName: '',
  };
  return MethodDecoratorFactory.createDecorator<SubscriptionMetadata>(
    N.SUBSCRIPTION_METADATA,
    spec,
    {decoratorName: '@jsConsume'},
  );
}
