import {jsConsume, type JsContext} from 'loopback-nats-connector';

/**
 * Consumes stream ALPHA on connection 'b' only. Mirror of the 'a' worker.
 */
export class AlphaOnBController {
  @jsConsume('ALPHA', 'alpha-b-worker', {
    autoAck: true,
    deliverPolicy: 'all',
    connection: 'b',
  })
  async onAlpha(_payload: unknown, ctx: JsContext): Promise<void> {
    console.log(
      `[AlphaOnB] connection=${ctx.connection} subject=${ctx.subject}`,
    );
  }
}
