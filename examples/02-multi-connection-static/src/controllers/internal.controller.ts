import {subscribe, type SubscriptionContext} from 'loopback-nats-connector';

interface OrderEvent {
  id?: string | number;
}

/**
 * Subscribes on the *default* (internal) connection. Logs each delivery
 * to stdout so you can see activity when publishing via the `nats` CLI.
 */
export class InternalController {
  @subscribe('orders.>')
  async onOrder(event: OrderEvent, ctx: SubscriptionContext): Promise<void> {
    console.log(
      `[InternalController] @subscribe ${ctx.subject} (conn=${ctx.connection}) → ${JSON.stringify(event)}`,
    );
  }
}
