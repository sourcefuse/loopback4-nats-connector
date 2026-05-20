import {inject} from '@loopback/core';
import {post, requestBody} from '@loopback/rest';
import {
  NatsConnectorComponentBindings as N,
  NatsPublisher,
  subscribe,
  type SubscriptionContext,
} from 'loopback-nats-connector';

/** Core Publish-Subscribe — natsbyexample.com/examples/messaging/pub-sub */
export class PubSubController {
  constructor(@inject(N.PUBLISHER) private pub: NatsPublisher) {}

  @subscribe('events.>')
  async onEvent(payload: unknown, ctx: SubscriptionContext): Promise<void> {
    console.log(
      `[pub-sub] events.> on ${ctx.subject}:`,
      JSON.stringify(payload),
    );
  }

  @subscribe('news.*')
  async onNews(payload: unknown, ctx: SubscriptionContext): Promise<void> {
    console.log(`[pub-sub] news.* on ${ctx.subject}:`, JSON.stringify(payload));
  }

  @post('/publish')
  async publish(
    @requestBody() body: {subject: string; payload: unknown},
  ): Promise<{published: true}> {
    await this.pub.publish(body.subject, body.payload);
    return {published: true};
  }
}
