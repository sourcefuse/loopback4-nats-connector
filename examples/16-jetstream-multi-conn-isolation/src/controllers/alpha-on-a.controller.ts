import {jsConsume, type JsContext} from 'loopback-nats-connector';

/**
 * Consumes stream ALPHA on connection 'a' only. Must never see messages
 * produced into broker B's same-named ALPHA stream.
 */
export class AlphaOnAController {
  @jsConsume('ALPHA', 'alpha-a-worker', {
    autoAck: true,
    deliverPolicy: 'all',
    connection: 'a',
  })
  async onAlpha(_payload: unknown, ctx: JsContext): Promise<void> {
    console.log(
      `[AlphaOnA] connection=${ctx.connection} subject=${ctx.subject}`,
    );
  }
}
