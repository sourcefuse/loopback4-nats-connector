import {inject} from '@loopback/core';
import {get, param} from '@loopback/rest';
import {
  NatsConnectorComponentBindings as N,
  NatsPublisher,
  reply,
} from 'loopback-nats-connector';

interface MathReq {
  a: number;
  b: number;
  op: 'add' | 'mul';
}

/** Request-Reply — natsbyexample.com/examples/messaging/request-reply */
export class RequestReplyController {
  constructor(@inject(N.PUBLISHER) private pub: NatsPublisher) {}

  @reply('time.now')
  async getTime(): Promise<{ts: number; iso: string}> {
    const now = new Date();
    console.log(`[req-reply] @reply time.now`);
    return {ts: now.getTime(), iso: now.toISOString()};
  }

  @reply('math.calc')
  async calc(req: MathReq): Promise<{result: number}> {
    const result = req.op === 'add' ? req.a + req.b : req.a * req.b;
    console.log(
      `[req-reply] @reply math.calc ${req.a}${req.op}${req.b}=${result}`,
    );
    return {result};
  }

  @get('/time')
  async httpTime(): Promise<unknown> {
    return this.pub.request('time.now', {});
  }

  @get('/calc')
  async httpCalc(
    @param.query.number('a') a: number,
    @param.query.number('b') b: number,
    @param.query.string('op') op: 'add' | 'mul',
  ): Promise<unknown> {
    return this.pub.request<MathReq, unknown>('math.calc', {a, b, op});
  }
}
