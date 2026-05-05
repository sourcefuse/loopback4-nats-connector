/**
 * Shared helper — binds per-name keys for a single NATS connection.
 *
 * Used by:
 *   - `ConnectionObserver` for the static fleet declared in options
 *   - `NatsConnectionRegistry` for the dynamic per-tenant fleet
 *
 * Both pathways must produce identical binding shape + tag set so the
 * subscription booter and KV repo (v2) cannot tell them apart.
 *
 * See:
 *   - docs/plan/05-internals.md  §`connection-registry.service.ts`
 *   - docs/plan/09-multi-connection.md §isolation guarantees
 */
import {Binding, BindingScope, Context} from '@loopback/core';
import {EventEmitter} from 'events';
import type {NatsConnection} from '@nats-io/nats-core';
import {jetstream as jetstreamFn} from '@nats-io/jetstream';
import type {JetStreamClient, JetStreamOptions} from '@nats-io/jetstream';
import {NatsBindingTags, NatsConnectorComponentBindings as N} from '../keys';
import {JsonCodec} from '../providers/codec.provider';
import {NatsPublisher} from '../services/nats-publisher.service';

export interface BindConnectionResult {
  events: EventEmitter;
}

/**
 * Bind `connection` / `codec` / `events` / `publisher` for the given
 * name onto the supplied LB4 context. Returns the EventEmitter so the
 * caller can wire status events into it.
 */
export function bindConnectionForName(
  ctx: Context,
  name: string,
  conn: NatsConnection,
  jetstream?: import('../types').JetStreamOptions,
): BindConnectionResult {
  const events = new EventEmitter();
  const codec = new JsonCodec();
  const publisher = new NatsPublisher(conn, codec);

  const tagged = (b: Binding<unknown>, artifact: string) =>
    b
      .tag({
        [NatsBindingTags.NATS_ARTIFACT]: artifact,
        [NatsBindingTags.CONNECTION]: name,
      })
      .inScope(BindingScope.SINGLETON);

  tagged(ctx.bind(N.connection(name)).to(conn), 'connection');
  tagged(ctx.bind(N.codec(name)).to(codec), 'codec');
  tagged(ctx.bind(N.events(name)).to(events), 'events');
  tagged(ctx.bind(N.publisher(name)).to(publisher), 'publisher');

  if (jetstream !== undefined) {
    // Lazy — first resolve constructs the JetStream client; subsequent
    // resolves return the cached one (singleton scope).
    const jsOpts = toNatsJsOpts(jetstream);
    tagged(
      ctx
        .bind(N.jetstream(name))
        .toDynamicValue((): JetStreamClient => jetstreamFn(conn, jsOpts)),
      'jetstream',
    );
  }

  return {events};
}

function toNatsJsOpts(
  opts: import('../types').JetStreamOptions,
): JetStreamOptions {
  const out: JetStreamOptions = {};
  if (opts.domain !== undefined) out.domain = opts.domain;
  if (opts.apiPrefix !== undefined) out.apiPrefix = opts.apiPrefix;
  if (opts.timeout !== undefined) out.timeout = opts.timeout;
  return out;
}

/**
 * Unbind every per-name key for the given connection name.
 * Used by `NatsConnectionRegistry.remove()`.
 */
export function unbindConnectionForName(ctx: Context, name: string): void {
  ctx.unbind(N.connection(name).key);
  ctx.unbind(N.codec(name).key);
  ctx.unbind(N.events(name).key);
  ctx.unbind(N.publisher(name).key);
  if (ctx.contains(N.jetstream(name).key)) {
    ctx.unbind(N.jetstream(name).key);
  }
}
