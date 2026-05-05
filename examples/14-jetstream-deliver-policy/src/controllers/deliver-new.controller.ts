import {jsConsume, type JsContext} from 'loopback-nats-connector';

export class DeliverNewController {
  @jsConsume('METRICS', 'metrics-new', {autoAck: true, deliverPolicy: 'new'})
  async handle(_payload: unknown, ctx: JsContext): Promise<void> {
    console.log(
      `[DeliverNew] seq=${ctx.meta.streamSequence} subject=${ctx.subject}`,
    );
  }
}
