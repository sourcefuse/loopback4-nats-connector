import {connect} from '@nats-io/transport-node';
import {Kvm} from '@nats-io/kv';

async function main() {
  const url = process.env.NATS_URL ?? 'nats://localhost:4222';
  const nc = await connect({servers: url});
  const kvm = new Kvm(nc as any);
  try {
    const kv = await kvm.open('config');
    const status = await kv.status();
    console.log(`bucket 'config' exists (entries=${status.values})`);
  } catch {
    await kvm.create('config', {history: 5});
    console.log("bucket 'config' created (history=5)");
  }
  await nc.drain();
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
