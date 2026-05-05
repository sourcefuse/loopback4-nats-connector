import {connect} from '@nats-io/transport-node';
import {jetstreamManager, AckPolicy, DeliverPolicy} from '@nats-io/jetstream';

async function main() {
  const url = process.env.NATS_URL ?? 'nats://localhost:4222';
  const nc = await connect({servers: url});
  const jsm = await jetstreamManager(nc);
  try { await jsm.streams.info('JOBS'); console.log('Stream JOBS already exists'); }
  catch { await jsm.streams.add({name: 'JOBS', subjects: ['jobs.>']}); console.log('Stream JOBS created'); }
  try { await jsm.consumers.info('JOBS', 'job-worker'); console.log('Consumer job-worker already exists'); }
  catch {
    await jsm.consumers.add('JOBS', {
      durable_name: 'job-worker',
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subject: 'jobs.>',
    });
    console.log('Consumer job-worker created');
  }
  await nc.drain();
}
main().catch(err => { console.error(err); process.exit(1); });
