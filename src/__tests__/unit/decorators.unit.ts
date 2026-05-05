/**
 * Unit tests for `@subscribe` / `@queueSubscribe` / `@reply`.
 *
 * Real deps exercised:
 *   - `@loopback/metadata`'s `MethodDecoratorFactory` write path.
 *   - `MetadataInspector.getAllMethodMetadata` read path.
 *
 * Mock surface: none. Tests apply decorators to anonymous classes,
 * read metadata back via the inspector.
 *
 * Out of scope: that the booter actually subscribes — covered by
 * `subscription-observer.unit.ts` and `examples/01-single-connection`.
 */
import {expect} from '@loopback/testlab';
import {MetadataInspector} from '@loopback/metadata';
import {NatsConnectorComponentBindings as N} from '../../keys';
import {subscribe, queueSubscribe} from '../../decorators/subscribe.decorator';
import {reply} from '../../decorators/reply.decorator';
import {jsConsume} from '../../decorators/js-consume.decorator';
import type {JsConsumeOptions, SubscriptionMetadata} from '../../types';

function readMeta(ctor: Function): Record<string, SubscriptionMetadata> {
  return (
    MetadataInspector.getAllMethodMetadata<SubscriptionMetadata>(
      N.SUBSCRIPTION_METADATA,
      ctor.prototype,
    ) ?? {}
  );
}

describe('@subscribe', () => {
  it('writes SubscriptionMetadata with kind=subscribe and default connection', () => {
    class C {
      @subscribe('orders.*.created')
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.kind).to.equal('subscribe');
    expect(meta.subject).to.equal('orders.*.created');
    expect(meta.connection).to.equal('default');
    expect(meta.queue).to.equal(undefined);
  });

  it('honours explicit connection and queue options', () => {
    class C {
      @subscribe('orders.*.created', {connection: 'internal', queue: 'workers'})
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.connection).to.equal('internal');
    expect(meta.queue).to.equal('workers');
  });

  it('passes connection: "*" through unchanged (template marker)', () => {
    class C {
      @subscribe('topic', {connection: '*'})
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.connection).to.equal('*');
  });

  it('exposes original options under `options` field for booter', () => {
    class C {
      @subscribe('topic', {maxMessages: 5, timeout: 1000, slow: 100})
      m() {}
    }
    const meta = readMeta(C).m;
    const opts = meta.options as {
      maxMessages?: number;
      timeout?: number;
      slow?: number;
    };
    expect(opts.maxMessages).to.equal(5);
    expect(opts.timeout).to.equal(1000);
    expect(opts.slow).to.equal(100);
  });
});

describe('@queueSubscribe', () => {
  it('is sugar — emits same metadata as @subscribe with queue set', () => {
    class C {
      @queueSubscribe('jobs.process', 'workers')
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.kind).to.equal('subscribe');
    expect(meta.subject).to.equal('jobs.process');
    expect(meta.queue).to.equal('workers');
    expect(meta.connection).to.equal('default');
  });

  it('honours explicit connection option', () => {
    class C {
      @queueSubscribe('jobs.process', 'workers', {connection: 'internal'})
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.connection).to.equal('internal');
    expect(meta.queue).to.equal('workers');
  });
});

describe('@reply', () => {
  it('writes SubscriptionMetadata with kind=reply', () => {
    class C {
      @reply('rpc.echo')
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.kind).to.equal('reply');
    expect(meta.subject).to.equal('rpc.echo');
    expect(meta.connection).to.equal('default');
  });

  it('honours explicit connection + queue (load-balanced reply group)', () => {
    class C {
      @reply('rpc.echo', {connection: 'internal', queue: 'replicas'})
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.connection).to.equal('internal');
    expect(meta.queue).to.equal('replicas');
  });
});

describe('@jsConsume', () => {
  it('writes SubscriptionMetadata with kind=jsConsume + stream + consumer', () => {
    class C {
      @jsConsume('ORDERS', 'order-archiver')
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.kind).to.equal('jsConsume');
    expect(meta.stream).to.equal('ORDERS');
    expect(meta.consumer).to.equal('order-archiver');
    expect(meta.connection).to.equal('default');
    expect(meta.subject).to.equal(undefined);
  });

  it('honours explicit connection and forwards JsConsumeOptions verbatim', () => {
    class C {
      @jsConsume('ORDERS', 'order-archiver', {
        connection: 'internal',
        autoAck: true,
        deliverPolicy: 'all',
        ackPolicy: 'explicit',
        maxDeliver: 5,
        filterSubject: 'orders.created',
      })
      m() {}
    }
    const meta = readMeta(C).m;
    expect(meta.connection).to.equal('internal');
    const opts = meta.options as JsConsumeOptions;
    expect(opts.autoAck).to.equal(true);
    expect(opts.deliverPolicy).to.equal('all');
    expect(opts.ackPolicy).to.equal('explicit');
    expect(opts.maxDeliver).to.equal(5);
    expect(opts.filterSubject).to.equal('orders.created');
  });

  it('defaults autoAck to undefined (caller must opt in)', () => {
    class C {
      @jsConsume('S', 'c')
      m() {}
    }
    const opts = readMeta(C).m.options as JsConsumeOptions;
    expect(opts.autoAck).to.equal(undefined);
  });
});

describe('multiple decorators', () => {
  it('captures one entry per decorated method on the class', () => {
    class Multi {
      @subscribe('a.*')
      foo() {}

      @reply('b')
      bar() {}

      @queueSubscribe('c', 'q')
      baz() {}
    }
    const all = readMeta(Multi);
    expect(Object.keys(all).sort()).to.deepEqual(['bar', 'baz', 'foo']);
    expect(all.foo.kind).to.equal('subscribe');
    expect(all.bar.kind).to.equal('reply');
    expect(all.baz.kind).to.equal('subscribe');
    expect(all.baz.queue).to.equal('q');
  });
});
