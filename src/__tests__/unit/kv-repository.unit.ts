/**
 * Unit tests for `JetStreamKvRepository<T>`.
 *
 * Real deps exercised: real `JsonCodec` round-trip + spy codec for
 * call assertions.
 *
 * Mock surface:
 *   - `Kvm.prototype.open` stubbed so KV ops go to a hand-rolled fake.
 *   - `JetStreamClient` needs only to satisfy the constructor type check.
 *
 * Out of scope: real broker round-trip → `examples/11-jetstream-kv`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect, sinon} from '@loopback/testlab';
import {Kvm} from '@nats-io/kv';
import {JsonCodec} from '../../providers/codec.provider';
import {JetStreamKvRepository} from '../../repositories/jetstream-kv.repository';
import type {Codec} from '../../types';

interface FakeKvEntry {
  key: string;
  value: Uint8Array;
  operation: 'PUT' | 'DEL' | 'PURGE';
}

function makeKv(
  opts: {
    getResolves?: FakeKvEntry | null;
    watchEntries?: FakeKvEntry[];
    watchStub?: sinon.SinonStub;
  } = {},
) {
  return {
    get: sinon.stub().resolves(opts.getResolves ?? null),
    put: sinon.stub().resolves(BigInt(1)),
    delete: sinon.stub().resolves(true),
    watch:
      opts.watchStub ??
      sinon.stub().callsFake(async () => {
        const entries = opts.watchEntries ?? [];
        return (async function* () {
          for (const e of entries) yield e;
        })();
      }),
  };
}

// Minimal fake JetStreamClient — Kvm.prototype.open is stubbed so this only
// needs to satisfy the TypeScript type at instantiation.
function makeJs() {
  return {options: {inboxPrefix: '_INBOX'}} as any;
}

class TestRepo<T> extends JetStreamKvRepository<T> {}

describe('JetStreamKvRepository', () => {
  const codec = new JsonCodec();
  let kvmCreateStub: sinon.SinonStub;

  beforeEach(() => {
    kvmCreateStub = sinon.stub(Kvm.prototype, 'create');
  });

  afterEach(() => {
    kvmCreateStub.restore();
  });

  it('get returns decoded payload for PUT entries', async () => {
    const value = codec.encode({enabled: true});
    const kv = makeKv({
      getResolves: {key: 'k', value, operation: 'PUT'},
    });
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<{enabled: boolean}>(makeJs(), codec, {
      bucket: 'b',
    });

    const got = await repo.get('k');
    expect(got).to.deepEqual({enabled: true});
  });

  it('get returns undefined for DEL entries', async () => {
    const kv = makeKv({
      getResolves: {key: 'k', value: new Uint8Array(), operation: 'DEL'},
    });
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<unknown>(makeJs(), codec, {bucket: 'b'});

    const got = await repo.get('k');
    expect(got).to.equal(undefined);
  });

  it('get returns undefined when key is absent (null entry)', async () => {
    const kv = makeKv({getResolves: null});
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<unknown>(makeJs(), codec, {bucket: 'b'});
    const got = await repo.get('missing');
    expect(got).to.equal(undefined);
  });

  it('put encodes via codec and forwards key + bytes to KV.put', async () => {
    const fake: Codec<unknown> = {
      encode: sinon.spy((v: unknown) => codec.encode(v)),
      decode: codec.decode.bind(codec),
    };
    const kv = makeKv();
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<{a: number}>(makeJs(), fake, {
      bucket: 'b',
    });

    await repo.put('k', {a: 1});
    sinon.assert.calledOnceWithExactly(fake.encode as sinon.SinonSpy, {a: 1});
    sinon.assert.calledOnceWithExactly(kv.put, 'k', codec.encode({a: 1}));
  });

  it('delete forwards key to KV.delete', async () => {
    const kv = makeKv();
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<unknown>(makeJs(), codec, {bucket: 'b'});
    await repo.delete('x');
    sinon.assert.calledOnceWithExactly(kv.delete, 'x');
  });

  it('watch yields decoded PUT entries and skips DEL', async () => {
    const kv = makeKv({
      watchEntries: [
        {key: 'a', value: codec.encode(1), operation: 'PUT'},
        {key: 'b', value: new Uint8Array(), operation: 'DEL'},
        {key: 'c', value: codec.encode(3), operation: 'PUT'},
      ],
    });
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<number>(makeJs(), codec, {bucket: 'b'});

    const collected: {key: string; value: number | undefined}[] = [];
    for await (const e of repo.watch()) {
      collected.push(e as {key: string; value: number | undefined});
    }

    expect(collected).to.deepEqual([
      {key: 'a', value: 1},
      {key: 'b', value: undefined},
      {key: 'c', value: 3},
    ]);
  });

  it('watch passes prefix as key filter', async () => {
    const kv = makeKv({watchEntries: []});
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<unknown>(makeJs(), codec, {bucket: 'b'});
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of repo.watch('prefix.*')) {
      // exhaust
    }
    sinon.assert.calledOnceWithExactly(kv.watch, {key: 'prefix.*'});
  });

  it('watch with no prefix passes no options', async () => {
    const kv = makeKv({watchEntries: []});
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<unknown>(makeJs(), codec, {bucket: 'b'});
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of repo.watch()) {
      // exhaust
    }
    sinon.assert.calledOnceWithExactly(kv.watch, undefined);
  });

  it('kvOrInit caches the KV instance (open called once for multiple operations)', async () => {
    const kv = makeKv({getResolves: null});
    kvmCreateStub.resolves(kv);
    const repo = new TestRepo<unknown>(makeJs(), codec, {bucket: 'b'});
    await repo.get('a');
    await repo.get('b');
    sinon.assert.calledOnce(kvmCreateStub);
  });

  // ── Gap 3 — C3 fix: try/finally calls iter.stop() on early break ─────────

  describe('watch() cleanup', () => {
    it('calls iter.stop() when caller breaks after first entry', async () => {
      const stopStub = sinon.stub();
      const entries = [
        {key: 'k1', value: codec.encode({n: 1}), operation: 'PUT'},
        {key: 'k2', value: codec.encode({n: 2}), operation: 'PUT'},
      ];

      async function* fakeIter() {
        for (const e of entries) yield e;
      }
      const iterObj = Object.assign(fakeIter(), {stop: stopStub});

      const kv = makeKv({
        watchStub: sinon.stub().returns(Promise.resolve(iterObj)),
      });
      kvmCreateStub.resolves(kv);
      const repo = new TestRepo<{n: number}>(makeJs(), codec, {bucket: 'b'});

      let count = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of repo.watch()) {
        count++;
        if (count >= 1) break;
      }

      sinon.assert.calledOnce(stopStub);
      expect(count).to.equal(1);
    });

    it('calls iter.stop() even when iterator is exhausted normally', async () => {
      const stopStub = sinon.stub();
      async function* fakeIter() {
        yield {key: 'k1', value: codec.encode(1), operation: 'PUT'};
      }
      const iterObj = Object.assign(fakeIter(), {stop: stopStub});

      const kv = makeKv({
        watchStub: sinon.stub().returns(Promise.resolve(iterObj)),
      });
      kvmCreateStub.resolves(kv);
      const repo = new TestRepo<number>(makeJs(), codec, {bucket: 'b'});

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of repo.watch()) {
        // exhaust
      }

      sinon.assert.calledOnce(stopStub);
    });
  });

  // ── H2 — reconnect invalidates KV cache ──────────────────────────────────

  describe('reconnect cache invalidation', () => {
    it('clears cached KV handle on reconnect event', async () => {
      const {EventEmitter} = await import('events');
      const events = new EventEmitter();
      const kv1 = makeKv({getResolves: null});
      const kv2 = makeKv({getResolves: null});
      kvmCreateStub.onFirstCall().resolves(kv1);
      kvmCreateStub.onSecondCall().resolves(kv2);

      const repo = new TestRepo<unknown>(
        makeJs(),
        codec,
        {bucket: 'b'},
        events,
      );
      await repo.get('a'); // initializes kv1
      sinon.assert.calledOnce(kvmCreateStub);

      events.emit('reconnect'); // should invalidate cache
      await repo.get('b'); // should re-init with kv2
      sinon.assert.calledTwice(kvmCreateStub);
    });
  });
});
