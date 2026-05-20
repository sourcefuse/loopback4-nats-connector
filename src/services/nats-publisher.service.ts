/**
 * NatsPublisher — injectable service. Per-connection instance bound at
 * `NatsConnectorComponentBindings.publisher(<name>)` plus the
 * unsuffixed `PUBLISHER` alias for the resolved-default connection.
 *
 * Methods:
 *   - publish(subject, payload, opts?)       encode → conn.publish
 *   - request(subject, payload, opts?)       encode → conn.request → decode
 *   - publishRaw(subject, bytes, opts?)      bypass codec, raw bytes on wire
 *
 * See:
 *   - docs/plan/04-public-api.md  §Services
 *   - docs/plan/05-internals.md   §services/nats-publisher.service.ts
 */
import type {NatsConnection} from '@nats-io/nats-core';
import type {Codec, PublishOptions, RequestOptions} from '../types';

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export class NatsPublisher {
  constructor(
    private readonly conn: NatsConnection,
    private readonly codec: Codec<unknown>,
  ) {}

  /**
   * Publish a message. NATS core pub/sub is at-most-once (QoS 0) — no server ack.
   * For guaranteed delivery use JetStream publish via `conn.jetstream().publish()`.
   * Throws if the connection is closed or the payload exceeds max_payload.
   */
  async publish<T>(
    subject: string,
    payload: T,
    opts: PublishOptions = {},
  ): Promise<void> {
    try {
      this.conn.publish(subject, this.codec.encode(payload), {
        headers: opts.headers,
        reply: opts.reply,
      });
    } catch (err) {
      throw new Error(
        `[nats] publish to '${subject}' failed: ${(err as Error).message}`,
      );
    }
  }

  async request<Req, Res>(
    subject: string,
    payload: Req,
    opts: RequestOptions = {},
  ): Promise<Res> {
    const msg = await this.conn.request(subject, this.codec.encode(payload), {
      timeout: opts.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
      headers: opts.headers,
      noMux: opts.noMux,
      reply: opts.reply,
    });
    return this.codec.decode(msg.data) as Res;
  }

  /**
   * Publish raw bytes (bypassing the codec). NATS core pub/sub is at-most-once
   * (QoS 0) — no server ack. For guaranteed delivery use JetStream publish via
   * `conn.jetstream().publish()`.
   * Throws if the connection is closed or the payload exceeds max_payload.
   */
  async publishRaw(
    subject: string,
    bytes: Uint8Array,
    opts: PublishOptions = {},
  ): Promise<void> {
    try {
      this.conn.publish(subject, bytes, {
        headers: opts.headers,
        reply: opts.reply,
      });
    } catch (err) {
      throw new Error(
        `[nats] publishRaw to '${subject}' failed: ${(err as Error).message}`,
      );
    }
  }
}
