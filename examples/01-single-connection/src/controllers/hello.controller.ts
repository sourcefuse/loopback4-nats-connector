import {inject} from '@loopback/core';
import {
  NatsConnectorComponentBindings as N,
  NatsPublisher,
  reply,
  subscribe,
  type SubscriptionContext,
} from 'loopback-nats-connector';

interface Greeting {
  name: string;
}

interface Health {
  ok: boolean;
  ts: number;
}

/**
 * Demonstrates `@subscribe` and `@reply` against a single connection.
 *
 * Try it (with broker running and `npm start` up):
 *   nats pub hello.greet.world '{"name":"world"}'   → triggers @subscribe
 *   nats sub audit.hello                             → see audit message
 *   nats request hello.health '' --timeout=2s        → @reply round-trip
 */
export class HelloController {
  constructor(@inject(N.PUBLISHER) private readonly publisher: NatsPublisher) {}

  @subscribe('hello.greet.*')
  async greet(payload: Greeting, ctx: SubscriptionContext): Promise<void> {
    console.log(
      `[HelloController] @subscribe ${ctx.subject} → ${JSON.stringify(payload)}`,
    );
    await this.publisher.publish('audit.hello', {
      greeted: payload.name,
      at: Date.now(),
    });
  }

  @reply('hello.health')
  async health(): Promise<Health> {
    console.log('[HelloController] @reply hello.health');
    return {ok: true, ts: Date.now()};
  }
}
