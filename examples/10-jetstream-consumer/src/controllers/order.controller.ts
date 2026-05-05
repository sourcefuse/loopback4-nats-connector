import {jsConsume, type JsContext} from 'loopback-nats-connector';

export interface OrderEvent {
  orderId: string;
  amount: number;
}

/**
 * Demonstrates `@jsConsume` push consumer with autoAck.
 *
 * Try it (with broker + provision script + npm start):
 *   nats publish orders.created '{"orderId":"o-1","amount":10}'
 *   → app log shows seq=1 deliveryCount=1
 */
export class OrderController {
  @jsConsume('ORDERS', 'order-archiver', {
    autoAck: true,
    deliverPolicy: 'all',
  })
  async archive(payload: OrderEvent, ctx: JsContext): Promise<void> {
    console.log(
      `[OrderController] @jsConsume seq=${ctx.meta.streamSequence} deliveryCount=${ctx.meta.deliveryCount} → ${JSON.stringify(payload)}`,
    );
  }
}
