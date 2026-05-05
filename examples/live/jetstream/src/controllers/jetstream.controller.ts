import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {NatsConnectorComponentBindings as N, type JetStreamClient} from 'loopback-nats-connector';

interface AppEvent { type: string; user?: string; ts?: number; data?: unknown }
interface Order    { orderId: string; amount: number; currency?: string }
interface Job      { jobId: string; type: string; payload?: unknown }
interface PriorityTask { taskId: string; priority: 'high'|'normal'|'low' }

/**
 * JetStream category — non-legacy coverage.
 *
 * natsbyexample examples covered:
 *  - limits-stream                 → POST /events
 *  - interest-stream               → POST /orders
 *  - workqueue-stream              → POST /jobs
 *  - pull-consumer                 → GET /events/process
 *  - pull-consumer-limits          → GET /priority/process (explicit limits)
 *  - api-migration                 → all endpoints use modern API
 *  - consumer-fetch-messages       → fetch / next variants
 *  - ack-ack                       → /orders/process uses msg.ackAck()
 *  - list-subjects                 → /streams/{name}/subjects
 *  - partitions                    → POST /partitioned-events + /partitions/{n}/process
 *
 * Legacy skipped per project decision:
 *  - push-consumer, queue-push-consumer, multi-stream-consumption
 */
export class JetStreamController {
  constructor(@inject(N.JETSTREAM) private js: JetStreamClient) {}

  // ── Limits Stream ──
  @post('/events')
  async publishEvent(@requestBody() ev: AppEvent): Promise<{seq: number}> {
    ev.ts = Date.now();
    const ack = await this.js.publish(`events.${ev.type}`, JSON.stringify(ev));
    console.log(`[limits] events.${ev.type} seq=${ack.seq}`);
    return {seq: ack.seq};
  }

  @get('/events/process')
  async processEvents(@param.query.integer('batch') batch: number = 5): Promise<unknown> {
    const consumer = await this.js.consumers.get('EVENTS', 'event-processor');
    const msgs = await consumer.fetch({max_messages: batch, expires: 2000});
    const out: any[] = [];
    for await (const m of msgs) {
      const ev = JSON.parse(new TextDecoder().decode(m.data));
      m.ack();
      out.push({seq: m.seq, subject: m.subject, type: ev.type});
      console.log(`[pull] EVENTS seq=${m.seq} type=${ev.type}`);
    }
    return {processed: out.length, items: out};
  }

  // ── Interest Stream + ack-ack ──
  @post('/orders')
  async publishOrder(@requestBody() order: Order): Promise<{seq: number}> {
    const ack = await this.js.publish(`orders.${order.orderId}`, JSON.stringify(order));
    console.log(`[interest] orders.${order.orderId} seq=${ack.seq}`);
    return {seq: ack.seq};
  }

  @get('/orders/process')
  async processOrders(@param.query.integer('batch') batch: number = 5): Promise<unknown> {
    const consumer = await this.js.consumers.get('ORDERS', 'order-validator');
    const msgs = await consumer.fetch({max_messages: batch, expires: 2000});
    const out: any[] = [];
    for await (const m of msgs) {
      const order = JSON.parse(new TextDecoder().decode(m.data));
      await m.ackAck();   // confirmed ack — waits for server
      out.push({seq: m.seq, orderId: order.orderId, ack: 'confirmed'});
      console.log(`[ack-ack] ORDERS seq=${m.seq} orderId=${order.orderId} ackAck=ok`);
    }
    return {processed: out.length, items: out};
  }

  // ── Work-queue Stream ──
  @post('/jobs')
  async publishJob(@requestBody() job: Job): Promise<{seq: number}> {
    const ack = await this.js.publish(`jobs.${job.type}`, JSON.stringify(job));
    console.log(`[workqueue] jobs.${job.type} seq=${ack.seq} jobId=${job.jobId}`);
    return {seq: ack.seq};
  }

  @get('/jobs/next')
  async nextJob(): Promise<unknown> {
    const consumer = await this.js.consumers.get('JOBS', 'job-worker');
    const m = await consumer.next({expires: 2000});
    if (!m) return {empty: true};
    const job = JSON.parse(new TextDecoder().decode(m.data));
    m.ack();
    console.log(`[workqueue] consumed seq=${m.seq} jobId=${job.jobId}`);
    return {seq: m.seq, job};
  }

  // ── Pull Consumer Limits — natsbyexample/pull-consumer-limits ──
  @post('/priority')
  async publishPriority(@requestBody() task: PriorityTask): Promise<{seq: number}> {
    const ack = await this.js.publish(`priority.${task.priority}`, JSON.stringify(task));
    console.log(`[priority] priority.${task.priority} seq=${ack.seq}`);
    return {seq: ack.seq};
  }

  @get('/priority/process')
  async processPriority(
    @param.query.integer('batch') batch: number = 10,
    @param.query.integer('expires') expires: number = 5000,
  ): Promise<unknown> {
    // Consumer config-side limits enforced server-side:
    //   max_ack_pending=5  → server delivers max 5 unacked
    //   max_batch=10       → per-fetch cap (server caps even if batch>10)
    //   max_expires=30s    → client cannot exceed
    //   max_bytes=1MB      → batch byte cap
    const consumer = await this.js.consumers.get('PRIORITY', 'priority-limited');
    const info = await consumer.info();
    const out: any[] = [];
    let limitError: string | undefined;
    try {
      const msgs = await consumer.fetch({max_messages: batch, expires});
      for await (const m of msgs) {
        const task = JSON.parse(new TextDecoder().decode(m.data));
        m.ack();
        out.push({seq: m.seq, priority: task.priority, taskId: task.taskId});
      }
    } catch (err) {
      limitError = (err as Error).message;
      console.log('[pull-limits] server enforced limit:', limitError);
    }
    console.log(`[pull-limits] PRIORITY processed=${out.length} (max_ack_pending=${info.config.max_ack_pending} max_batch=${info.config.max_batch})`);
    return {
      processed: out.length,
      ...(limitError ? {limitError} : {}),
      consumerLimits: {
        max_ack_pending: info.config.max_ack_pending,
        max_batch: info.config.max_batch,
        max_waiting: info.config.max_waiting,
        max_bytes: info.config.max_bytes,
      },
      items: out,
    };
  }

  // ── Subject-Mapped Partitions — natsbyexample/partitions ──
  // Run only with server-partitions.conf + PARTITIONS=1 provision flag.
  @post('/partitioned-events')
  async publishPartitioned(@requestBody() body: {key: string; data: unknown}): Promise<unknown> {
    // Server's mapping rewrites events.<key> → events.<key>.<partition>
    // Client uses original subject; server routes to partition stream.
    const ack = await this.js.publish(`events.${body.key}`, JSON.stringify(body.data));
    console.log(`[partitions] published events.${body.key} seq=${ack.seq}`);
    return {originalSubject: `events.${body.key}`, seq: ack.seq};
  }

  @get('/partitions/{n}/process')
  async processPartition(
    @param.path.integer('n') n: number,
    @param.query.integer('batch') batch: number = 10,
  ): Promise<unknown> {
    const stream = `PARTITION-${n}`;
    try {
      const consumer = await this.js.consumers.get(stream, 'partition-consumer');
      const msgs = await consumer.fetch({max_messages: batch, expires: 1000});
      const out: any[] = [];
      for await (const m of msgs) {
        m.ack();
        out.push({seq: m.seq, subject: m.subject});
      }
      console.log(`[partitions] ${stream} processed=${out.length}`);
      return {partition: n, stream, processed: out.length, items: out};
    } catch {
      return {partition: n, stream, error: 'stream not provisioned (PARTITIONS=1 npm run provision)'};
    }
  }

  // ── Stream Info + List Subjects ──
  @get('/streams/{name}/info')
  async streamInfo(@param.path.string('name') name: string): Promise<unknown> {
    const stream = await this.js.streams.get(name);
    const info = await stream.info();
    return {
      name: info.config.name,
      retention: info.config.retention,
      messages: info.state.messages,
      bytes: info.state.bytes,
      firstSeq: info.state.first_seq,
      lastSeq: info.state.last_seq,
      consumers: info.state.consumer_count,
    };
  }

  @get('/streams/{name}/subjects')
  async listSubjects(
    @param.path.string('name') name: string,
    @param.query.string('filter') filter: string = '>',
  ): Promise<unknown> {
    const stream = await this.js.streams.get(name);
    const info = await stream.info(false, {subjects_filter: filter});
    return {stream: name, filter, subjects: info.state.subjects ?? {}};
  }
}
