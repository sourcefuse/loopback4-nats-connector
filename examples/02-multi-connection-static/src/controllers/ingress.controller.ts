import {subscribe, type SubscriptionContext} from 'loopback-nats-connector';

interface IngressEvent {
  id?: string | number;
}

/**
 * Subscribes on the *ingress* connection only. Proves isolation —
 * messages published on the internal broker do NOT reach this handler.
 */
export class IngressController {
  @subscribe('public.>', {connection: 'ingress'})
  async onPublic(event: IngressEvent, ctx: SubscriptionContext): Promise<void> {
    console.log(
      `[IngressController] @subscribe ${ctx.subject} (conn=${ctx.connection}) → ${JSON.stringify(event)}`,
    );
  }
}
