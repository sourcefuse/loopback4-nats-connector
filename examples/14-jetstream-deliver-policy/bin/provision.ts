import {connect} from '@nats-io/transport-node';
import {jetstreamManager, AckPolicy, DeliverPolicy} from '@nats-io/jetstream';

async function main() {
  const url = process.env.NATS_URL ?? 'nats://localhost:4222';
  const nc = await connect({servers: url});
  const jsm = await jetstreamManager(nc);
  try { await jsm.streams.info('METRICS'); console.log('Stream METRICS already exists'); }
  catch { await jsm.streams.add({name: 'METRICS', subjects: ['metrics.>']}); console.log('Stream METRICS created'); }
  for (const [name, policy] of [
    ['metrics-all', DeliverPolicy.All],
    ['metrics-new', DeliverPolicy.New],
    ['metrics-last', DeliverPolicy.Last],
  ] as const) {
    try { await jsm.consumers.info('METRICS', name); console.log(`Consumer ${name} already exists`); }
    catch {
      await jsm.consumers.add('METRICS', {
        durable_name: name,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: policy,
        filter_subject: 'metrics.>',
      });
      console.log(`Consumer ${name} created (policy=${policy})`);
    }
  }
  await nc.drain();
}
main().catch(err => { console.error(err); process.exit(1); });
