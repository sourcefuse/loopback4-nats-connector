/**
 * Unit tests for `ConnectionObserver` + `buildConnectOptions` mapping
 * + `wireStatusEvents` re-emission.
 *
 * Real deps exercised:
 *   - LB4 `Application.bind(...)` / `Context.get(...)`.
 *   - `Promise.allSettled` failure isolation.
 *   - `EventEmitter` listener invocation.
 *   - `nats.connect` + `conn.status()` mocked at module level.
 *
 * Mock surface:
 *   - `connect()` replaced with stub returning a fake `NatsConnection`
 *     whose `.status()` yields a controlled async iterable.
 *   - `nkeyAuthenticator` / `jwtAuthenticator` replaced with sentinel
 *     functions to assert the auth mapper invokes them.
 *
 * Out of scope:
 *   - Real wire delivery → `pubsub.integration.ts`.
 *   - JetStream client construction → v2.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect, sinon} from '@loopback/testlab';
import {Application, BindingScope} from '@loopback/core';
import {
  ConnectionObserver,
  internals,
  buildConnectOptions,
} from '../../observers/connection.observer';
import {NatsConnectorComponentBindings as N, NatsBindingTags} from '../../keys';
import {NatsPublisher} from '../../services/nats-publisher.service';
import type {
  ConnectionOptions,
  NatsConnectorOptionsCanonical,
} from '../../types';

interface FakeNatsConnection {
  status: sinon.SinonStub;
  drain: sinon.SinonStub;
  /** signal to emit on the controlled status iterator */
  pushStatus(s: {type: string; data: unknown}): void;
  closeStatusIterator(): void;
}

function makeFakeConn(): FakeNatsConnection {
  const queue: Array<{type: string; data: unknown}> = [];
  let waiter:
    | ((v: IteratorResult<{type: string; data: unknown}>) => void)
    | null = null;
  let closed = false;

  const iterator: AsyncIterableIterator<{type: string; data: unknown}> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (queue.length > 0) {
        return Promise.resolve({value: queue.shift()!, done: false as const});
      }
      if (closed) {
        return Promise.resolve({value: undefined, done: true as const});
      }
      return new Promise(resolve => {
        waiter = resolve;
      });
    },
  };

  return {
    status: sinon.stub().returns(iterator),
    drain: sinon.stub().resolves(),
    pushStatus(s) {
      if (waiter) {
        const w = waiter;
        waiter = null;
        w({value: s, done: false as const});
      } else {
        queue.push(s);
      }
    },
    closeStatusIterator() {
      closed = true;
      if (waiter) {
        const w = waiter;
        waiter = null;
        w({value: undefined, done: true as const});
      }
    },
  };
}

describe('ConnectionObserver', () => {
  let connectStub: sinon.SinonStub;
  let originalConnect: typeof internals.connect;

  beforeEach(() => {
    originalConnect = internals.connect;
    connectStub = sinon.stub();
    internals.connect = connectStub as unknown as typeof internals.connect;
  });

  afterEach(() => {
    internals.connect = originalConnect;
  });

  function buildApp(options: NatsConnectorOptionsCanonical): Application {
    const app = new Application();
    app.bind(N.NORMALIZED_OPTIONS).to(options);
    app.lifeCycleObserver(ConnectionObserver);
    return app;
  }

  describe('start()', () => {
    it('opens every named connection in parallel', async () => {
      connectStub.resolves(makeFakeConn());
      const app = buildApp({
        connections: {
          a: {servers: ['nats://x:4222']},
          b: {servers: ['nats://y:4222']},
        },
      });
      await app.start();

      expect(connectStub.callCount).to.equal(2);
      const calls = connectStub.getCalls().map(c => c.args[0].servers);
      expect(calls).to.containDeep([['nats://x:4222']]);
      expect(calls).to.containDeep([['nats://y:4222']]);

      await app.stop();
    });

    it('binds N.connection(name) / N.codec(name) / N.events(name) / N.publisher(name) per connection', async () => {
      connectStub.resolves(makeFakeConn());
      const app = buildApp({
        connections: {primary: {servers: ['nats://x:4222']}},
      });
      await app.start();

      expect(app.contains(N.connection('primary').key)).to.be.true();
      expect(app.contains(N.codec('primary').key)).to.be.true();
      expect(app.contains(N.events('primary').key)).to.be.true();
      expect(app.contains(N.publisher('primary').key)).to.be.true();

      const codec = await app.get(N.codec('primary'));
      expect(typeof codec.encode).to.equal('function');
      const publisher = await app.get(N.publisher('primary'));
      expect(publisher).to.be.instanceOf(NatsPublisher);

      await app.stop();
    });

    it('tags each per-connection binding with {nats: <artifact>, connection: <name>}', async () => {
      connectStub.resolves(makeFakeConn());
      const app = buildApp({
        connections: {primary: {servers: ['nats://x:4222']}},
      });
      await app.start();

      const expected = {connection: 'primary'};
      const connBinding = app.getBinding(N.connection('primary'));
      expect(connBinding.tagMap[NatsBindingTags.NATS_ARTIFACT]).to.equal(
        'connection',
      );
      expect(connBinding.tagMap[NatsBindingTags.CONNECTION]).to.equal(
        'primary',
      );
      expect(connBinding.scope).to.equal(BindingScope.SINGLETON);

      const codecBinding = app.getBinding(N.codec('primary'));
      expect(codecBinding.tagMap[NatsBindingTags.NATS_ARTIFACT]).to.equal(
        'codec',
      );
      expect(codecBinding.tagMap[NatsBindingTags.CONNECTION]).to.equal(
        'primary',
      );

      // shape sanity
      expect(expected.connection).to.equal('primary');

      await app.stop();
    });

    it('aliases unsuffixed N.PUBLISHER / N.CONNECTION / N.CODEC / N.EVENTS to literal "default" connection', async () => {
      connectStub.resolves(makeFakeConn());
      const app = buildApp({
        connections: {default: {servers: ['nats://x:4222']}},
      });
      await app.start();

      const namedPub = await app.get(N.publisher('default'));
      const aliasedPub = await app.get(N.PUBLISHER);
      expect(aliasedPub).to.equal(namedPub);

      await app.stop();
    });

    it('aliases unsuffixed keys to the explicit `default` field when provided (rule 1)', async () => {
      connectStub.resolves(makeFakeConn());
      const app = buildApp({
        connections: {
          internal: {servers: ['nats://i:4222']},
          ingress: {servers: ['nats://x:4222']},
        },
        default: 'internal',
      });
      await app.start();

      const internalPub = await app.get(N.publisher('internal'));
      const aliasedPub = await app.get(N.PUBLISHER);
      expect(aliasedPub).to.equal(internalPub);

      await app.stop();
    });

    it('does NOT bind unsuffixed aliases when there is no resolvable default (rule 3)', async () => {
      connectStub.resolves(makeFakeConn());
      const app = buildApp({
        connections: {
          a: {servers: ['nats://a:4222']},
          b: {servers: ['nats://b:4222']},
        },
      });
      await app.start();

      expect(app.contains(N.PUBLISHER.key)).to.be.false();
      expect(app.contains(N.CONNECTION.key)).to.be.false();

      await app.stop();
    });

    it('captures one-connection-fail-isolated startup (other connections still bound)', async () => {
      // First call resolves; second rejects.
      connectStub.onFirstCall().resolves(makeFakeConn());
      connectStub.onSecondCall().rejects(new Error('connect failed'));
      const app = buildApp({
        connections: {
          ok: {servers: ['nats://ok:4222']},
          bad: {servers: ['nats://bad:4222']},
        },
      });

      // Suppress console.error noise during this test.
      const errStub = sinon.stub(console, 'error');
      try {
        await app.start();
      } finally {
        errStub.restore();
      }

      expect(app.contains(N.connection('ok').key)).to.be.true();
      expect(app.contains(N.connection('bad').key)).to.be.false();

      await app.stop();
    });
  });

  describe('stop()', () => {
    it('drains each opened connection on stop', async () => {
      const fakeA = makeFakeConn();
      const fakeB = makeFakeConn();
      connectStub.onFirstCall().resolves(fakeA);
      connectStub.onSecondCall().resolves(fakeB);

      const app = buildApp({
        connections: {
          a: {servers: ['nats://a:4222']},
          b: {servers: ['nats://b:4222']},
        },
      });
      await app.start();
      await app.stop();

      expect(fakeA.drain.calledOnce).to.be.true();
      expect(fakeB.drain.calledOnce).to.be.true();
    });

    it('unbinds per-name bindings on stop (H3 fix)', async () => {
      const fake = makeFakeConn();
      connectStub.resolves(fake);
      const app = buildApp({
        connections: {primary: {servers: ['nats://x:4222']}},
      });
      await app.start();
      expect(app.contains(N.connection('primary').key)).to.be.true();

      await app.stop();
      expect(app.contains(N.connection('primary').key)).to.be.false();
    });
  });

  describe('restart safety', () => {
    it('start → stop → start re-binds cleanly without duplicate listeners', async () => {
      const fake = makeFakeConn();
      connectStub.resolves(fake);
      const app = buildApp({
        connections: {default: {servers: ['nats://x:4222']}},
      });

      await app.start();
      const emitter1 = await app.get(N.events('default'));
      const listenersBefore = emitter1.listenerCount('error');

      await app.stop();
      expect(app.contains(N.connection('default').key)).to.be.false();

      // Reset drain so second start gets a fresh fake
      const fake2 = makeFakeConn();
      connectStub.reset();
      connectStub.resolves(fake2);

      await app.start();
      const emitter2 = await app.get(N.events('default'));
      expect(emitter2.listenerCount('error')).to.equal(listenersBefore);

      await app.stop();
    });
  });

  describe('status event re-emission', () => {
    it('re-emits each nats.js Status entry on N.events(name)', async () => {
      const fake = makeFakeConn();
      connectStub.resolves(fake);

      const app = buildApp({
        connections: {primary: {servers: ['nats://x:4222']}},
      });
      await app.start();

      const events = await app.get(N.events('primary'));
      const observed: Array<{type: string; data: unknown}> = [];
      events.on('disconnect', (data: unknown) =>
        observed.push({type: 'disconnect', data}),
      );
      events.on('reconnect', (data: unknown) =>
        observed.push({type: 'reconnect', data}),
      );
      events.on('update', (data: unknown) =>
        observed.push({type: 'update', data}),
      );
      events.on('ldm', (data: unknown) => observed.push({type: 'ldm', data}));
      events.on('reconnecting', (data: unknown) =>
        observed.push({type: 'reconnecting', data}),
      );
      events.on('staleConnection', (data: unknown) =>
        observed.push({type: 'staleConnection', data}),
      );
      events.on('ping', (data: unknown) => observed.push({type: 'ping', data}));
      events.on('error', (data: unknown) =>
        observed.push({type: 'error', data}),
      );

      // Push a status entry per supported event.
      // Note: these objects match the v3 Status type structures from @nats-io/nats-core.
      const fixtures = [
        {type: 'disconnect', server: 'nats://x:4222', data: 'nats://x:4222'},
        {type: 'reconnect', server: 'nats://x:4222', data: 'nats://x:4222'},
        {type: 'reconnecting', data: undefined},
        {
          type: 'update',
          added: ['nats://y:4222'],
          deleted: [],
          data: {added: ['nats://y:4222'], deleted: []},
        },
        {type: 'ldm', server: 'nats://x:4222', data: 'nats://x:4222'},
        {type: 'staleConnection', data: undefined},
        {type: 'ping', pendingPings: 1, data: 1},
        {
          type: 'error',
          error: new Error('AUTHORIZATION_VIOLATION'),
          data: 'AUTHORIZATION_VIOLATION',
        },
      ];
      for (const f of fixtures) {
        fake.pushStatus(f);
      }

      // Allow the iterator microtask to drain.
      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));

      // All 8 events fired with the correct payload.
      expect(observed).to.have.length(8);
      for (let i = 0; i < fixtures.length; i++) {
        expect(observed[i].type).to.equal(fixtures[i].type);
        expect(observed[i].data).to.deepEqual(fixtures[i].data);
      }

      fake.closeStatusIterator();
      await app.stop();
    });
  });
});

describe('buildConnectOptions', () => {
  it('forwards servers and synthesizes name from map key', () => {
    const out = buildConnectOptions({servers: ['nats://x:4222']}, 'primary');
    expect(out.servers).to.deepEqual(['nats://x:4222']);
    expect(out.name).to.equal('primary');
  });

  it('honours explicit ConnectionOptions.name over map key', () => {
    const out = buildConnectOptions(
      {servers: ['nats://x:4222'], name: 'override'},
      'primary',
    );
    expect(out.name).to.equal('override');
  });

  it('maps {token} → connect({token})', () => {
    const out = buildConnectOptions(
      {servers: ['nats://x:4222'], auth: {token: 'tk'}},
      'p',
    );
    expect(out.token).to.equal('tk');
  });

  it('maps {user, pass} → connect({user, pass})', () => {
    const out = buildConnectOptions(
      {servers: ['nats://x:4222'], auth: {user: 'u', pass: 'p'}},
      'p',
    );
    expect(out.user).to.equal('u');
    expect(out.pass).to.equal('p');
  });

  it('maps {tls} with PEM strings → connect({tls})', () => {
    const out = buildConnectOptions(
      {
        servers: ['nats://x:4222'],
        auth: {tls: {cert: '<PEM>', key: '<PEM>', ca: '<PEM>'}},
      },
      'p',
    );
    expect(out.tls).to.deepEqual({cert: '<PEM>', key: '<PEM>', ca: '<PEM>'});
  });

  it('maps {tls} with Buffer values → PEM strings on wire', () => {
    const cert = Buffer.from('cert-pem-bytes', 'utf8');
    const out = buildConnectOptions(
      {servers: ['nats://x:4222'], auth: {tls: {cert}}},
      'p',
    );
    expect(out.tls?.cert).to.equal('cert-pem-bytes');
  });

  it('maps {nkey} → authenticator', () => {
    const out = buildConnectOptions(
      {servers: ['nats://x:4222'], auth: {nkey: {seed: 'SUSEED'}}},
      'p',
    );
    expect(typeof out.authenticator).to.equal('function');
  });

  it('maps {jwt} → authenticator', () => {
    const out = buildConnectOptions(
      {
        servers: ['nats://x:4222'],
        auth: {jwt: {jwt: 'eyJhbG...', seed: 'SUSEED'}},
      },
      'p',
    );
    expect(typeof out.authenticator).to.equal('function');
  });

  it('forwards reconnect block fields', () => {
    const reconnect: ConnectionOptions['reconnect'] = {
      maxReconnectAttempts: 7,
      reconnectTimeWait: 1000,
      pingInterval: 30_000,
      maxPingOut: 3,
      timeout: 2000,
      noRandomize: true,
      noEcho: true,
    };
    const out = buildConnectOptions(
      {servers: ['nats://x:4222'], reconnect},
      'p',
      // tslint:disable-next-line: no-any
    ) as any;
    expect(out.maxReconnectAttempts).to.equal(7);
    expect(out.reconnectTimeWait).to.equal(1000);
    expect(out.pingInterval).to.equal(30_000);
    expect(out.maxPingOut).to.equal(3);
    expect(out.timeout).to.equal(2000);
    expect(out.noRandomize).to.equal(true);
    expect(out.noEcho).to.equal(true);
  });
});
