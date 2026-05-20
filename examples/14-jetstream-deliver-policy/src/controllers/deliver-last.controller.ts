import {jsConsume, type JsContext} from 'loopback-nats-connector';

export class DeliverLastController {
  @jsConsume('METRICS', 'metrics-last', {autoAck: true, deliverPolicy: 'last'})
  async handle(_payload: unknown, ctx: JsContext): Promise<void> {
    console.log(
      `[DeliverLast] seq=${ctx.meta.streamSequence} subject=${ctx.subject}`,
    );
  }
}
