import {inject} from '@loopback/core';
import {post, requestBody} from '@loopback/rest';
import {NatsConnectorComponentBindings as N, NatsPublisher, reply, subscribe} from 'loopback-nats-connector';

interface Order { orderId: string; amount: number; currency?: string; items?: string[] }
interface OrderAck { orderId: string; accepted: boolean; ts: number }

/** JSON for Message Payloads — natsbyexample.com/examples/messaging/json */
export class JsonPayloadController {
  constructor(@inject(N.PUBLISHER) private pub: NatsPublisher) {}

  @subscribe('data.orders')
  async onOrder(order: Order): Promise<void> {
    console.log(`[json] @subscribe data.orders orderId=${order.orderId} amount=${order.amount} items=${JSON.stringify(order.items ?? [])}`);
  }

  @reply('order.validate')
  async validate(order: Order): Promise<OrderAck> {
    const accepted = order.amount > 0 && !!order.orderId;
    console.log(`[json] @reply order.validate orderId=${order.orderId} accepted=${accepted}`);
    return {orderId: order.orderId, accepted, ts: Date.now()};
  }

  @post('/orders')
  async createOrder(@requestBody() order: Order): Promise<{queued: true}> {
    await this.pub.publish('data.orders', order);
    return {queued: true};
  }
}
