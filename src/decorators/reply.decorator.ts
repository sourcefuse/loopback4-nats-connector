/**
 * `@reply` decorator — request/response handler.
 *
 * Method's return value is encoded via the connection's codec and
 * sent on `msg.reply`. If the inbound message has no `reply` (i.e.
 * caller used `publish` not `request`), the return value is silently
 * discarded — same semantics as nats.js.
 *
 * See:
 *   - docs/plan/04-public-api.md §`@reply`
 *   - docs/plan/05-internals.md  §Decorators
 */
import {MethodDecoratorFactory} from '@loopback/metadata';
import {NatsConnectorComponentBindings as N} from '../keys';
import type {ReplyOptions, SubscriptionMetadata} from '../types';

/**
 * Reply to NATS request/reply on a subject.
 *
 * @example
 *   @reply('orders.lookup')
 *   async lookup(req: {id: string}): Promise<Order | null> { ... }
 */
export function reply(
  subject: string,
  opts: ReplyOptions = {},
): MethodDecorator {
  const spec: SubscriptionMetadata = {
    kind: 'reply',
    subject,
    queue: opts.queue,
    connection: opts.connection ?? 'default',
    options: opts,
    methodName: '', // filled by booter from MetadataInspector key
  };
  return MethodDecoratorFactory.createDecorator<SubscriptionMetadata>(
    N.SUBSCRIPTION_METADATA,
    spec,
    {decoratorName: '@reply'},
  );
}
