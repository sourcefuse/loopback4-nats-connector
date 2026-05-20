/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect, sinon} from '@loopback/testlab';
import {Application} from '@loopback/core';
import {NatsConnectionRegistry} from '../../services/connection-registry.service';
import {internals} from '../../observers/connection.observer';
import {NatsConnectorComponentBindings as N} from '../../keys';

describe('NatsConnectionRegistry', () => {
  let app: Application;
  let registry: NatsConnectionRegistry;
  let fakeConn: {
    drain: sinon.SinonStub;
    status: sinon.SinonStub;
  };
  let originalConnect: typeof internals.connect;

  beforeEach(() => {
    app = new Application();
    registry = new NatsConnectionRegistry(app as any);
    fakeConn = {
      drain: sinon.stub().resolves(),
      status: sinon.stub().returns(
        (async function* () {
          // noop — immediately done
        })(),
      ),
    };
    originalConnect = internals.connect;
    internals.connect = sinon.stub().resolves(fakeConn as any);
  });

  afterEach(() => {
    internals.connect = originalConnect;
  });

  describe('add()', () => {
    it('adds a connection and marks it as present', async () => {
      await registry.add('t1', {servers: ['nats://localhost:4222']});
      expect(registry.has('t1')).to.be.true();
      expect(registry.list()).to.deepEqual(['t1']);
    });

    it('throws when name already exists', async () => {
      await registry.add('dup', {servers: ['nats://localhost:4222']});
      await expect(
        registry.add('dup', {servers: ['nats://localhost:4222']}),
      ).to.be.rejectedWith(/already exists/);
    });

    it('rollback: drains conn + unbinds keys when onAdd handler throws', async () => {
      registry.onAdd(() => {
        throw new Error('handler failed');
      });

      await expect(
        registry.add('tenant1', {servers: ['nats://localhost:4222']}),
      ).to.be.rejectedWith('handler failed');

      expect(registry.has('tenant1')).to.be.false();
      sinon.assert.calledOnce(fakeConn.drain);
      expect(app.contains(N.connection('tenant1').key)).to.be.false();
    });

    it('no zombie: map stays empty after rollback', async () => {
      let calls = 0;
      registry.onAdd(() => {
        calls++;
        if (calls === 1) throw new Error('first fails');
      });

      await expect(
        registry.add('z1', {servers: ['nats://localhost:4222']}),
      ).to.be.rejectedWith('first fails');
      expect(registry.list()).to.deepEqual([]);

      // Second add (handler doesn't throw) should succeed
      await registry.add('z2', {servers: ['nats://localhost:4222']});
      expect(registry.list()).to.deepEqual(['z2']);
    });
  });

  describe('remove()', () => {
    it('removes connection and unbinds keys', async () => {
      await registry.add('r1', {servers: ['nats://localhost:4222']});
      expect(registry.has('r1')).to.be.true();

      await registry.remove('r1');
      expect(registry.has('r1')).to.be.false();
      sinon.assert.calledOnce(fakeConn.drain);
    });

    it('is idempotent on unknown name', async () => {
      await expect(registry.remove('unknown')).to.be.fulfilled();
    });
  });

  describe('stop()', () => {
    it('drains all connections', async () => {
      const fakeA = {
        drain: sinon.stub().resolves(),
        status: sinon.stub().returns((async function* () {})()),
      };
      const fakeB = {
        drain: sinon.stub().resolves(),
        status: sinon.stub().returns((async function* () {})()),
      };
      (internals.connect as sinon.SinonStub)
        .onFirstCall()
        .resolves(fakeA as any)
        .onSecondCall()
        .resolves(fakeB as any);

      await registry.add('t1', {servers: ['nats://localhost:4222']});
      await registry.add('t2', {servers: ['nats://localhost:4222']});
      await registry.stop();

      sinon.assert.calledOnce(fakeA.drain);
      sinon.assert.calledOnce(fakeB.drain);
      expect(registry.list()).to.deepEqual([]);
    });
  });

  describe('onAdd / onRemove handlers', () => {
    it('onAdd handler fires after successful add', async () => {
      const handler = sinon.stub().resolves();
      registry.onAdd(handler);
      await registry.add('h1', {servers: ['nats://localhost:4222']});
      sinon.assert.calledOnceWithExactly(handler, 'h1');
    });

    it('onRemove handler fires before drain', async () => {
      const order: string[] = [];
      registry.onRemove(() => {
        order.push('handler');
      });
      fakeConn.drain = sinon.stub().callsFake(async () => {
        order.push('drain');
      });

      await registry.add('h2', {servers: ['nats://localhost:4222']});
      await registry.remove('h2');
      expect(order).to.deepEqual(['handler', 'drain']);
    });

    it('dispose() from onAdd removes the handler', async () => {
      const handler = sinon.stub().resolves();
      const {dispose} = registry.onAdd(handler);
      dispose();
      await registry.add('nd', {servers: ['nats://localhost:4222']});
      sinon.assert.notCalled(handler);
    });
  });
});
