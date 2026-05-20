import {jsConsume, type JsContext} from 'loopback-nats-connector';

export class PaymentsController {
  @jsConsume('EVENTS', 'payments-only', {
    autoAck: true,
    deliverPolicy: 'all',
    filterSubject: 'events.payments.>',
  })
  async onPayment(_payload: unknown, ctx: JsContext): Promise<void> {
    console.log(`[PaymentsController] subject=${ctx.subject}`);
  }
}
