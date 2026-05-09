import {connect} from '@nats-io/transport-node';
import {jetstreamManager, AckPolicy, DeliverPolicy} from '@nats-io/jetstream';

async function main() {
  const url = process.env.NATS_URL ?? 'nats://localhost:4222';
  const nc = await connect({servers: url});
  const jsm = await jetstreamManager(nc);
  try {
    await jsm.streams.info('TASKS');
    console.log('Stream TASKS already exists');
  } catch {
    await jsm.streams.add({name: 'TASKS', subjects: ['tasks.>']});
    console.log('Stream TASKS created');
  }
  try {
    await jsm.consumers.info('TASKS', 'task-worker');
    console.log('Consumer task-worker already exists');
  } catch {
    await jsm.consumers.add('TASKS', {
      durable_name: 'task-worker',
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subject: 'tasks.>',
      ack_wait: 5_000_000_000, // 5s
    });
    console.log('Consumer task-worker created');
  }
  await nc.drain();
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
