/**
 * Idempotent provisioner: creates ORDERS stream + 'order-archiver' pull consumer.
 */
import {connect} from '@nats-io/transport-node';
import {jetstreamManager, AckPolicy, DeliverPolicy} from '@nats-io/jetstream';

async function main() {
  const url = process.env.NATS_URL ?? 'nats://localhost:4222';
  const nc = await connect({servers: url});
  const jsm = await jetstreamManager(nc);
  try {
    await jsm.streams.info('ORDERS');
    console.log('Stream ORDERS already exists');
  } catch {
    await jsm.streams.add({name: 'ORDERS', subjects: ['orders.>']});
    console.log('Stream ORDERS created');
  }
  try {
    await jsm.consumers.info('ORDERS', 'order-archiver');
    console.log('Consumer order-archiver already exists');
  } catch {
    await jsm.consumers.add('ORDERS', {
      durable_name: 'order-archiver',
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subject: 'orders.>',
    });
    console.log('Consumer order-archiver created');
  }
  await nc.drain();
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
