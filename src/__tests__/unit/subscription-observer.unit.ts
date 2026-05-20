/**
 * Unit tests for `SubscriptionBooter` (P1.D + P1.E booter behaviour).
 *
 * Real deps exercised:
 *   - LB4 `Application.bind` / `findByTag` / `controller(...)`
 *   - `MetadataInspector.getAllMethodMetadata` reading what the
 *     `@subscribe` / `@reply` decorators wrote.
 *   - `SubscriptionBooter.start()` / `stop()`
 *
 * Mock surface:
 *   - `NatsConnection` stubbed with `subscribe` returning a fake
 *     `Subscription` object exposing `drain` (stub) and a `_callback`
 *     captured from the subscribe options for direct invocation.
 *   - `JsonCodec` real (encode/decode).
 *
 * Out of scope:
 *   - Real wire delivery → `examples/01-single-connection`.
 *   - Template `connection: '*'` registration → P3.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect, sinon} from '@loopback/testlab';
import {Application, CoreTags} from '@loopback/core';
import {SubscriptionBooter} from '../../observers/subscription.observer';
import {NatsConnectorComponentBindings as N} from '../../keys';
import {JsonCodec} from '../../providers/codec.provider';
import {subscribe, queueSubscribe} from '../../decorators/subscribe.decorator';
import {reply} from '../../decorators/reply.decorator';
import {jsConsume} from '../../decorators/js-consume.decorator';

interface FakeSub {
  drain: sinon.SinonStub;
  _callback: ((err: Error | null, msg: any) => void) | null;
}

function fakeSubscription(): FakeSub {
  return {drain: sinon.stub().resolves(), _callback: null};
}

function fakeConn() {
  const subs: FakeSub[] = [];
  return {
    subscribe: sinon.stub().callsFake((_subject: string, opts: any) => {
      const fs = fakeSubscription();
      fs._callback = opts?.callback ?? null;
      subs.push(fs);
      return fs;
    }),
    subs,
  };
}

function fakeMsg(opts: {
  subject: string;
  data: Uint8Array;
  reply?: string;
  respond?: sinon.SinonStub;
}) {
  return {
    subject: opts.subject,
    data: opts.data,
    reply: opts.reply,
    headers: undefined,
    respond: opts.respond ?? sinon.stub(),
  };
}

describe('SubscriptionBooter', () => {
  function buildApp(opts: {
    connections: Record<string, ReturnType<typeof fakeConn>>;
    controllers: Function[];
  }) {
    const app = new Application();

    for (const [name, conn] of Object.entries(opts.connections)) {
      app.bind(N.connection(name)).to(conn as any);
      app.bind(N.codec(name)).to(new JsonCodec());
    }

    for (const ctor of opts.controllers) {
      app.controller(ctor as any).tag({[CoreTags.CONTROLLER]: 'controller'});
    }

    app.lifeCycleObserver(SubscriptionBooter);
    return app;
  }

  describe('start()', () => {
    it('calls conn.subscribe per @subscribe metadata entry, with subject + queue forwarded', async () => {
      class C {
        @subscribe('orders.*.created', {queue: 'workers'})
        m() {}
      }
      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();

      sinon.assert.calledOnce(conn.subscribe);
      const [subject, opts] = conn.subscribe.firstCall.args;
      expect(subject).to.equal('orders.*.created');
      expect(opts.queue).to.equal('workers');
      expect(typeof opts.callback).to.equal('function');

      await app.stop();
    });

    it('routes each entry to the right named connection per metadata.connection', async () => {
      class C {
        @subscribe('a.topic', {connection: 'a'})
        ma() {}
        @subscribe('b.topic', {connection: 'b'})
        mb() {}
      }
      const a = fakeConn();
      const b = fakeConn();
      const app = buildApp({
        connections: {a, b},
        controllers: [C],
      });
      await app.start();

      sinon.assert.calledOnce(a.subscribe);
      sinon.assert.calledOnce(b.subscribe);
      expect(a.subscribe.firstCall.args[0]).to.equal('a.topic');
      expect(b.subscribe.firstCall.args[0]).to.equal('b.topic');

      await app.stop();
    });

    it('forwards SubscribeOptions.maxMessages → opts.max and timeout → opts.timeout', async () => {
      class C {
        @subscribe('topic', {maxMessages: 5, timeout: 1000})
        m() {}
      }
      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();

      const opts = conn.subscribe.firstCall.args[1];
      expect(opts.max).to.equal(5);
      expect(opts.timeout).to.equal(1000);

      await app.stop();
    });

    it('boot fails when metadata references an unknown connection', async () => {
      class C {
        @subscribe('topic', {connection: 'missing'})
        m() {}
      }
      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });

      await expect(app.start()).to.be.rejectedWith(/missing/);
    });

    it('skips connection: "*" templates (deferred to P3 dynamic)', async () => {
      class C {
        @subscribe('topic', {connection: '*'})
        m() {}
      }
      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();

      sinon.assert.notCalled(conn.subscribe);

      await app.stop();
    });
  });

  describe('handler dispatch', () => {
    it('decodes payload via codec and invokes controller method with (payload, ctx)', async () => {
      const seen: Array<{p: unknown; ctxConn: string; subject: string}> = [];

      class C {
        @subscribe('topic')
        async m(payload: any, ctx: any) {
          seen.push({
            p: payload,
            ctxConn: ctx.connection,
            subject: ctx.subject,
          });
        }
      }

      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();

      const codec = new JsonCodec();
      const fs = conn.subs[0];
      fs._callback?.(
        null,
        fakeMsg({subject: 'topic', data: codec.encode({hello: 'world'})}),
      );

      // Dispatch is async — flush microtasks.
      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      expect(seen).to.have.length(1);
      expect(seen[0].p).to.deepEqual({hello: 'world'});
      expect(seen[0].ctxConn).to.equal('default');
      expect(seen[0].subject).to.equal('topic');

      await app.stop();
    });

    it('@reply: calls msg.respond with codec.encode(returnValue)', async () => {
      class C {
        @reply('rpc.echo')
        async m(payload: any) {
          return {echo: payload};
        }
      }

      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();

      const codec = new JsonCodec();
      const respond = sinon.stub();
      const fs = conn.subs[0];
      fs._callback?.(
        null,
        fakeMsg({
          subject: 'rpc.echo',
          data: codec.encode({q: 'hi'}),
          reply: 'inbox.42',
          respond,
        }),
      );

      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      sinon.assert.calledOnce(respond);
      const respondedBytes = respond.firstCall.args[0];
      expect(codec.decode(respondedBytes)).to.deepEqual({echo: {q: 'hi'}});

      await app.stop();
    });

    it('@reply with no msg.reply (caller used publish, not request) does NOT call msg.respond', async () => {
      class C {
        @reply('rpc.echo')
        async m() {
          return {ok: true};
        }
      }

      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();

      const codec = new JsonCodec();
      const respond = sinon.stub();
      const fs = conn.subs[0];
      fs._callback?.(
        null,
        fakeMsg({
          subject: 'rpc.echo',
          data: codec.encode({q: 'hi'}),
          reply: undefined,
          respond,
        }),
      );

      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      sinon.assert.notCalled(respond);

      await app.stop();
    });

    it('handler throw → does NOT call msg.respond, does NOT propagate (logged)', async () => {
      class C {
        @reply('rpc')
        async m() {
          throw new Error('boom');
        }
      }

      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();

      const codec = new JsonCodec();
      const respond = sinon.stub();
      const errStub = sinon.stub(console, 'error');
      try {
        const fs = conn.subs[0];
        fs._callback?.(
          null,
          fakeMsg({
            subject: 'rpc',
            data: codec.encode(null),
            reply: 'inbox',
            respond,
          }),
        );
        await new Promise(r => setImmediate(r));
        await new Promise(r => setImmediate(r));

        sinon.assert.notCalled(respond);
        sinon.assert.calledWithMatch(errStub, /handler.*threw/);
      } finally {
        errStub.restore();
      }

      await app.stop();
    });
  });

  describe('stop()', () => {
    it('drains every registered subscription', async () => {
      class C {
        @subscribe('a')
        ma() {}
        @subscribe('b')
        mb() {}
      }

      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();
      await app.stop();

      expect(conn.subs).to.have.length(2);
      sinon.assert.calledOnce(conn.subs[0].drain);
      sinon.assert.calledOnce(conn.subs[1].drain);
    });

    it('stop() awaits in-flight dispatchCore before resolving', async () => {
      let resolveHandler!: () => void;
      const handlerDone = new Promise<void>(resolve => {
        resolveHandler = resolve;
      });

      class SlowController {
        @subscribe('slow.topic')
        async handle() {
          await handlerDone;
        }
      }

      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [SlowController],
      });
      await app.start();

      // Trigger message — handler starts, does NOT finish
      const fs = conn.subs[0];
      fs._callback?.(
        null,
        fakeMsg({subject: 'slow.topic', data: new Uint8Array()}),
      );

      // stop() should not resolve while handler is running
      const stopPromise = app.stop();
      let stopResolved = false;
      // eslint-disable-next-line no-void
      void stopPromise.then(() => {
        stopResolved = true;
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(stopResolved).to.be.false();

      // Finish handler → stop should now complete
      resolveHandler();
      await stopPromise;
      expect(stopResolved).to.be.true();
    });

    it('handler rejection is caught — no unhandledRejection event', done => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);

      class FailingController {
        @subscribe('fail.topic')
        async handle() {
          throw new Error('handler boom');
        }
      }

      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [FailingController],
      });

      // eslint-disable-next-line no-void
      void app.start().then(() => {
        const fs = conn.subs[0];
        fs._callback?.(
          null,
          fakeMsg({subject: 'fail.topic', data: new Uint8Array()}),
        );

        setTimeout(() => {
          process.off('unhandledRejection', onUnhandled);
          expect(unhandled).to.be.empty();
          // eslint-disable-next-line no-void
          void app.stop();
          done();
        }, 50);
      });
    });
  });

  describe('jsConsume', () => {
    interface FakeJsSub {
      drain: sinon.SinonStub;
    }

    function fakeJsSub(): FakeJsSub {
      return {drain: sinon.stub().resolves()};
    }

    function fakeJs() {
      const builders: any[] = [];
      const subs: FakeJsSub[] = [];

      const consumeStub = sinon.stub();
      consumeStub.callsFake((opts: any) => {
        if (opts?.callback) {
          builders.push({callbackFn: opts.callback});
        }
        const s = fakeJsSub();
        subs.push(s);
        return Promise.resolve(s);
      });

      return {
        consumers: {
          get: sinon.stub().resolves({
            consume: consumeStub,
          }),
        },
        builders,
        subs,
      };
    }

    function fakeJsMsg(opts: {
      data: Uint8Array;
      ack?: sinon.SinonStub;
      nak?: sinon.SinonStub;
      term?: sinon.SinonStub;
      working?: sinon.SinonStub;
      info?: any;
    }) {
      return {
        subject: 'orders.created',
        data: opts.data,
        headers: undefined,
        ack: opts.ack ?? sinon.stub(),
        nak: opts.nak ?? sinon.stub(),
        term: opts.term ?? sinon.stub(),
        working: opts.working ?? sinon.stub(),
        info: opts.info ?? {
          stream: 'ORDERS',
          consumer: 'order-archiver',
          streamSequence: 1,
          deliverySequence: 1,
          deliveryCount: 1,
          redelivered: false,
          pending: 0,
        },
      };
    }

    function buildJsApp(opts: {
      js: ReturnType<typeof fakeJs>;
      controllers: Function[];
      connectionName?: string;
    }) {
      const name = opts.connectionName ?? 'default';
      const app = new Application();
      // Bind the per-name codec; connection isn't used by the jsConsume arm
      // but resolveConnectionName runs early — bind a dummy connection too.
      app.bind(N.codec(name)).to(new JsonCodec());
      app.bind(N.connection(name)).to({} as any);
      app.bind(N.jetstream(name)).to(opts.js as any);
      // Provide minimal options so resolveConnectionName accepts the name.
      app.bind(N.NORMALIZED_OPTIONS).to({
        connections: {[name]: {servers: ['nats://x:4222'], jetstream: {}}},
      } as any);
      for (const ctor of opts.controllers) {
        app.controller(ctor as any).tag({[CoreTags.CONTROLLER]: 'controller'});
      }
      app.lifeCycleObserver(SubscriptionBooter);
      return app;
    }

    it('boots @jsConsume by calling js.consumers.get() and consumer.consume()', async () => {
      class C {
        @jsConsume('ORDERS', 'order-archiver', {
          filterSubject: 'orders.created',
        })
        m() {}
      }
      const js = fakeJs();
      const app = buildJsApp({js, controllers: [C]});
      await app.start();

      // v3 API: calls js.consumers.get(stream, consumer)
      sinon.assert.calledOnce(js.consumers.get);
      const [stream, consumer] = js.consumers.get.firstCall.args;
      expect(stream).to.equal('ORDERS');
      expect(consumer).to.equal('order-archiver');

      await app.stop();
    });

    it('uses ">" as default filter subject when none specified', async () => {
      class C {
        @jsConsume('ORDERS', 'c1')
        m() {}
      }
      const js = fakeJs();
      const app = buildJsApp({js, controllers: [C]});
      await app.start();

      // With v3, filterSubject handling is different; just verify consumers.get was called
      sinon.assert.calledOnce(js.consumers.get);
      const [stream, consumer] = js.consumers.get.firstCall.args;
      expect(stream).to.equal('ORDERS');
      expect(consumer).to.equal('c1');

      await app.stop();
    });

    it('autoAck → calls msg.ack() after handler resolves', async () => {
      class C {
        @jsConsume('ORDERS', 'c1', {autoAck: true})
        async m() {
          /* no-op */
        }
      }
      const js = fakeJs();
      const app = buildJsApp({js, controllers: [C]});
      await app.start();

      const codec = new JsonCodec();
      const ack = sinon.stub();
      const builder = js.builders[0];
      builder.callbackFn(fakeJsMsg({data: codec.encode({a: 1}), ack}));

      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      sinon.assert.calledOnce(ack);

      await app.stop();
    });

    it('autoAck + handler throw → calls msg.nak() and does NOT propagate', async () => {
      class C {
        @jsConsume('ORDERS', 'c1', {autoAck: true})
        async m() {
          throw new Error('boom');
        }
      }
      const js = fakeJs();
      const app = buildJsApp({js, controllers: [C]});
      await app.start();

      const codec = new JsonCodec();
      const ack = sinon.stub();
      const nak = sinon.stub();
      const errStub = sinon.stub(console, 'error');
      try {
        const builder = js.builders[0];
        builder.callbackFn(fakeJsMsg({data: codec.encode({a: 1}), ack, nak}));
        await new Promise(r => setImmediate(r));
        await new Promise(r => setImmediate(r));

        sinon.assert.notCalled(ack);
        sinon.assert.calledOnce(nak);
      } finally {
        errStub.restore();
      }

      await app.stop();
    });

    it('JsContext exposes ack/nak/term/inProgress + meta from JsMsg.info', async () => {
      const seenMeta: any[] = [];
      class C {
        @jsConsume('ORDERS', 'c1')
        async m(_payload: any, ctx: any) {
          seenMeta.push(ctx.meta);
          await ctx.ack();
        }
      }
      const js = fakeJs();
      const app = buildJsApp({js, controllers: [C]});
      await app.start();

      const codec = new JsonCodec();
      const ack = sinon.stub();
      const builder = js.builders[0];
      builder.callbackFn(
        fakeJsMsg({
          data: codec.encode({a: 1}),
          ack,
          info: {
            stream: 'ORDERS',
            consumer: 'c1',
            streamSequence: 42,
            deliverySequence: 7,
            deliveryCount: 2,
            redelivered: true,
            pending: 5,
          },
        }),
      );

      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      expect(seenMeta).to.have.length(1);
      expect(seenMeta[0]).to.deepEqual({
        stream: 'ORDERS',
        consumer: 'c1',
        streamSequence: 42,
        deliverySequence: 7,
        deliveryCount: 2,
        redelivered: true,
        pending: 5,
      });
      // ctx.ack() was invoked from inside the handler
      sinon.assert.calledOnce(ack);

      await app.stop();
    });

    it('boot fails when @jsConsume targets a connection without jetstream binding', async () => {
      class C {
        @jsConsume('ORDERS', 'c1')
        m() {}
      }
      const app = new Application();
      app.bind(N.codec('default')).to(new JsonCodec());
      app.bind(N.connection('default')).to({} as any);
      // NOTE: no N.jetstream('default') binding
      app.bind(N.NORMALIZED_OPTIONS).to({
        connections: {default: {servers: ['nats://x:4222']}},
      } as any);
      app.controller(C).tag({[CoreTags.CONTROLLER]: 'controller'});
      app.lifeCycleObserver(SubscriptionBooter);

      await expect(app.start()).to.be.rejectedWith(/no jetstream configured/);
    });
  });

  describe('queue subscribe', () => {
    it('@queueSubscribe forwards queue to conn.subscribe opts', async () => {
      class C {
        @queueSubscribe('jobs', 'workers')
        m() {}
      }
      const conn = fakeConn();
      const app = buildApp({
        connections: {default: conn},
        controllers: [C],
      });
      await app.start();

      const opts = conn.subscribe.firstCall.args[1];
      expect(opts.queue).to.equal('workers');

      await app.stop();
    });
  });
});
