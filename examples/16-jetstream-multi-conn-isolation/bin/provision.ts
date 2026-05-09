import {connect} from '@nats-io/transport-node';
import {jetstreamManager, AckPolicy, DeliverPolicy} from '@nats-io/jetstream';

async function ensureAlpha(url: string, label: string, consumerName: string) {
  const nc = await connect({servers: url});
  const jsm = await jetstreamManager(nc);
  try {
    await jsm.streams.info('ALPHA');
    console.log(`[${label}] Stream ALPHA already exists`);
  } catch {
    await jsm.streams.add({name: 'ALPHA', subjects: ['alpha.>']});
    console.log(`[${label}] Stream ALPHA created`);
  }
  try {
    await jsm.consumers.info('ALPHA', consumerName);
    console.log(`[${label}] Consumer ${consumerName} already exists`);
  } catch {
    await jsm.consumers.add('ALPHA', {
      durable_name: consumerName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subject: 'alpha.>',
    });
    console.log(`[${label}] Consumer ${consumerName} created`);
  }
  await nc.drain();
}

async function main() {
  const a = process.env.A_NATS_URL ?? 'nats://localhost:4222';
  const b = process.env.B_NATS_URL ?? 'nats://localhost:4223';
  await ensureAlpha(a, 'A', 'alpha-a-worker');
  await ensureAlpha(b, 'B', 'alpha-b-worker');
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
