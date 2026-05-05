/**
 * `JetStreamKvRepository<T>` — base class for typed JetStream KV access (v2).
 *
 * Subclass it; bind a JetStream client + codec from the *same* named
 * connection (the binding tags carry the connection name — caller's
 * responsibility to keep them consistent).
 *
 * Bucket provisioning (`KvOptions.history`, `replicas`, etc.) is
 * out-of-band — `new Kvm(js).open(name)` (from `@nats-io/kv`) auto-creates
 * with defaults; pass options on first call if your app owns the bucket spec.
 *
 * Codec is captured at construction (same limitation as `NatsPublisher`):
 * rebinding the connection's codec after the repo is constructed will
 * not propagate. Tracked as a v1.x followup.
 *
 * See:
 *   - docs/plan/04-public-api.md §`JetStreamKvRepository<T>`
 *   - docs/plan/05-internals.md  §`repositories/jetstream-kv.repository.ts`
 */
import type {JetStreamClient} from '@nats-io/jetstream';
import {EventEmitter, addAbortListener} from 'events';
import {Kvm} from '@nats-io/kv';
import type {KV, KvEntry} from '@nats-io/kv';
import type {Codec} from '../types';

export interface JetStreamKvRepositoryConfig {
  bucket: string;
}

export abstract class JetStreamKvRepository<T> {
  private kv?: KV;

  constructor(
    protected readonly js: JetStreamClient,
    protected readonly codec: Codec<unknown>,
    protected readonly config: JetStreamKvRepositoryConfig,
    events?: EventEmitter,
    signal?: AbortSignal,
  ) {
    if (events) {
      const onReconnect = () => {
        this.kv = undefined;
      };
      events.on('reconnect', onReconnect);
      if (signal) {
        addAbortListener(signal, () => events.off('reconnect', onReconnect));
      }
    }
  }

  protected async kvOrInit(): Promise<KV> {
    if (!this.kv) {
      // Idempotent: create returns existing bucket if already provisioned.
      this.kv = await new Kvm(this.js).create(this.config.bucket);
    }
    return this.kv;
  }

  async get(key: string): Promise<T | undefined> {
    const kv = await this.kvOrInit();
    const entry = await kv.get(key);
    if (!entry || entry.operation !== 'PUT') return undefined;
    return this.codec.decode(entry.value) as T;
  }

  async put(key: string, value: T): Promise<void> {
    const kv = await this.kvOrInit();
    await kv.put(key, this.codec.encode(value));
  }

  async delete(key: string): Promise<void> {
    const kv = await this.kvOrInit();
    await kv.delete(key);
  }

  async *watch(
    prefix?: string,
  ): AsyncIterable<{key: string; value: T | undefined}> {
    const kv = await this.kvOrInit();
    const iter = await kv.watch(prefix ? {key: prefix} : undefined);
    try {
      for await (const entry of iter as AsyncIterable<KvEntry>) {
        yield {
          key: entry.key,
          value:
            entry.operation === 'PUT'
              ? (this.codec.decode(entry.value) as T)
              : undefined,
        };
      }
    } finally {
      (iter as {stop?: () => void}).stop?.();
    }
  }
}
