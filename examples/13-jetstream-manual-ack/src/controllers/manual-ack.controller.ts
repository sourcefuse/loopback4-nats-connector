import {jsConsume, type JsContext} from 'loopback-nats-connector';

export interface TaskPayload {
  id: string;
  attempt?: number;
}

/**
 * Manual ack/nak. `id === 'flaky'` is nak'd on first delivery, ack'd on
 * second. Anything else is ack'd immediately.
 *
 * Try it:
 *   nats publish tasks.go '{"id":"good"}'   → 1 delivery
 *   nats publish tasks.go '{"id":"flaky"}'  → 2 deliveries (nak then ack)
 */
export class ManualAckController {
  @jsConsume('TASKS', 'task-worker', {
    ackPolicy: 'explicit',
    deliverPolicy: 'all',
    maxDeliver: 5,
    ackWait: 1000,
  })
  async handle(payload: TaskPayload, ctx: JsContext): Promise<void> {
    const action =
      payload.id === 'flaky' && ctx.meta.deliveryCount === 1 ? 'NAK' : 'ACK';
    console.log(
      `[ManualAckController] @jsConsume id=${payload.id} deliveryCount=${ctx.meta.deliveryCount} → ${action}`,
    );
    if (action === 'NAK') {
      await ctx.nak(50);
      return;
    }
    await ctx.ack();
  }
}
