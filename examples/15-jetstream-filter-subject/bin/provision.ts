import {connect} from '@nats-io/transport-node';
import {jetstreamManager, AckPolicy, DeliverPolicy} from '@nats-io/jetstream';

async function main() {
  const url = process.env.NATS_URL ?? 'nats://localhost:4222';
  const nc = await connect({servers: url});
  const jsm = await jetstreamManager(nc);
  try {
    await jsm.streams.info('EVENTS');
    console.log('Stream EVENTS already exists');
  } catch {
    await jsm.streams.add({name: 'EVENTS', subjects: ['events.>']});
    console.log('Stream EVENTS created');
  }
  for (const [name, filter] of [
    ['orders-only', 'events.orders.>'],
    ['payments-only', 'events.payments.>'],
  ] as const) {
    try {
      await jsm.consumers.info('EVENTS', name);
      console.log(`Consumer ${name} already exists`);
    } catch {
      await jsm.consumers.add('EVENTS', {
        durable_name: name,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        filter_subject: filter,
      });
      console.log(`Consumer ${name} created (filter=${filter})`);
    }
  }
  await nc.drain();
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
