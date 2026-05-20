import {jsConsume, type JsContext} from 'loopback-nats-connector';

export class DeliverAllController {
  @jsConsume('METRICS', 'metrics-all', {autoAck: true, deliverPolicy: 'all'})
  async handle(_payload: unknown, ctx: JsContext): Promise<void> {
    console.log(
      `[DeliverAll] seq=${ctx.meta.streamSequence} subject=${ctx.subject}`,
    );
  }
}
