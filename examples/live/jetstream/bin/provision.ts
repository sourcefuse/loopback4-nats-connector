/**
 * Provisions all streams + consumers for JetStream category demo.
 * Idempotent.
 *
 * Modes:
 *   default          → EVENTS, ORDERS, JOBS, SUBJECTS, PRIORITY streams
 *   PARTITIONS=1     → Same EXCEPT EVENTS replaced by PARTITION-0..4
 *                       (those streams cover events.*.<n> instead, see
 *                        server-partitions.conf for subject mapping)
 */
import {connect} from '@nats-io/transport-node';
import {
  jetstreamManager,
  RetentionPolicy,
  StorageType,
  AckPolicy,
  DiscardPolicy,
} from '@nats-io/jetstream';

async function ensureStream(jsm: any, cfg: any) {
  try {
    const info = await jsm.streams.info(cfg.name);
    console.log(`stream ${cfg.name} exists (msgs=${info.state.messages})`);
  } catch {
    await jsm.streams.add(cfg);
    console.log(`stream ${cfg.name} created`);
  }
}
async function ensureConsumer(jsm: any, stream: string, cfg: any) {
  const name = cfg.durable_name ?? cfg.name;
  try {
    await jsm.consumers.info(stream, name);
    console.log(`consumer ${stream}/${name} exists`);
  } catch {
    await jsm.consumers.add(stream, cfg);
    console.log(`consumer ${stream}/${name} created`);
  }
}
async function deleteStream(jsm: any, name: string) {
  try {
    await jsm.streams.delete(name);
    console.log(`stream ${name} deleted`);
  } catch {
    /* ok */
  }
}

async function main() {
  const url = process.env.NATS_URL ?? 'nats://localhost:4222';
  const auth: any = process.env.NATS_USER
    ? {user: process.env.NATS_USER, pass: process.env.NATS_PASS}
    : {};
  const partitions = process.env.PARTITIONS === '1';

  const nc = await connect({servers: url, ...auth});
  const jsm = await jetstreamManager(nc);

  if (partitions) {
    // Partition mode — EVENTS would overlap with PARTITION-*
    await deleteStream(jsm, 'EVENTS');
  } else {
    await ensureStream(jsm, {
      name: 'EVENTS',
      subjects: ['events.>'],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_msgs: 1000,
      max_bytes: 10 * 1024 * 1024,
      max_age: 60 * 60 * 1e9,
      discard: DiscardPolicy.Old,
    });
    await ensureConsumer(jsm, 'EVENTS', {
      durable_name: 'event-processor',
      ack_policy: AckPolicy.Explicit,
      filter_subject: 'events.>',
    });
  }

  await ensureStream(jsm, {
    name: 'ORDERS',
    subjects: ['orders.>'],
    retention: RetentionPolicy.Interest,
    storage: StorageType.File,
  });
  await ensureStream(jsm, {
    name: 'JOBS',
    subjects: ['jobs.>'],
    retention: RetentionPolicy.Workqueue,
    storage: StorageType.File,
  });
  await ensureStream(jsm, {
    name: 'SUBJECTS',
    subjects: ['plain', 'greater.>', 'star.*'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.Memory,
  });
  await ensureStream(jsm, {
    name: 'PRIORITY',
    subjects: ['priority.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
  });

  await ensureConsumer(jsm, 'ORDERS', {
    durable_name: 'order-validator',
    ack_policy: AckPolicy.Explicit,
    filter_subject: 'orders.>',
  });
  await ensureConsumer(jsm, 'JOBS', {
    durable_name: 'job-worker',
    ack_policy: AckPolicy.Explicit,
    filter_subject: 'jobs.>',
  });
  await ensureConsumer(jsm, 'PRIORITY', {
    durable_name: 'priority-limited',
    ack_policy: AckPolicy.Explicit,
    filter_subject: 'priority.>',
    max_ack_pending: 5,
    max_batch: 10,
    max_waiting: 100,
    max_expires: 30 * 1e9,
    max_bytes: 1024 * 1024,
  });

  if (partitions) {
    for (let i = 0; i < 5; i++) {
      await ensureStream(jsm, {
        name: `PARTITION-${i}`,
        subjects: [`events.*.${i}`],
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
      });
      await ensureConsumer(jsm, `PARTITION-${i}`, {
        durable_name: 'partition-consumer',
        ack_policy: AckPolicy.Explicit,
        filter_subject: `events.*.${i}`,
      });
    }
  }

  await nc.drain();
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
