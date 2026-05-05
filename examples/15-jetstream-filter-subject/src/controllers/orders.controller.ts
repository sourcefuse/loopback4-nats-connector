import {jsConsume, type JsContext} from 'loopback-nats-connector';

export class OrdersController {
  @jsConsume('EVENTS', 'orders-only', {
    autoAck: true,
    deliverPolicy: 'all',
    filterSubject: 'events.orders.>',
  })
  async onOrder(_payload: unknown, ctx: JsContext): Promise<void> {
    console.log(`[OrdersController] subject=${ctx.subject}`);
  }
}
