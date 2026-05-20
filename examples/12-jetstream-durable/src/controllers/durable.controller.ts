import {jsConsume, type JsContext} from 'loopback-nats-connector';

export interface JobEvent {
  jobId: string;
}

/**
 * Durable consumer. Server-side checkpoint resumes from last ack'd
 * sequence — stop the app, publish more, restart, only the new ones
 * are delivered.
 *
 * Try it:
 *   nats publish jobs.do '{"jobId":"j-1"}'
 *   nats publish jobs.do '{"jobId":"j-2"}'
 *   # stop app (Ctrl-C), publish more:
 *   nats publish jobs.do '{"jobId":"j-3"}'
 *   # restart app — see j-3 only.
 */
export class DurableController {
  @jsConsume('JOBS', 'job-worker', {autoAck: true, deliverPolicy: 'all'})
  async handle(payload: JobEvent, ctx: JsContext): Promise<void> {
    console.log(
      `[DurableController] @jsConsume seq=${ctx.meta.streamSequence} → ${JSON.stringify(payload)}`,
    );
  }
}
