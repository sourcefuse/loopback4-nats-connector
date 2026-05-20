import {
  reply,
  subscribe,
  type SubscriptionContext,
} from 'loopback-nats-connector';

interface OrderCreated {
  id: string;
}

/**
 * Template subscription — `connection: '*'` means "every registered
 * tenant connection now and future". `ctx.connection` carries the
 * tenant ID per delivered message.
 */
export class FleetController {
  @subscribe('orders.created', {connection: '*'})
  async onOrderCreated(
    payload: OrderCreated,
    ctx: SubscriptionContext,
  ): Promise<void> {
    console.log(
      '[FleetController] @subscribe orders.created on tenant=' +
        ctx.connection +
        ' → ' +
        JSON.stringify(payload),
    );
  }

  @reply('health.check', {connection: '*'})
  async health(_payload: unknown, ctx: SubscriptionContext) {
    return {ok: true, tenant: ctx.connection};
  }
}
