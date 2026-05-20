/**
 * Unit tests for `NatsPublisher` + `JsonCodec`.
 *
 * Real deps exercised:
 *   - `JsonCodec.encode` / `.decode` round-trip via real
 *     `TextEncoder` / `TextDecoder`.
 *   - `NatsPublisher` -> stub `NatsConnection.publish` / `.request`.
 *
 * Mock surface:
 *   - `NatsConnection` is a hand-rolled object with `publish` /
 *     `request` sinon stubs. Minimal `Msg` shape returned by
 *     `request`: `{data: Uint8Array}`.
 *   - Two codec specimens: real `JsonCodec` (asserts wire bytes round-
 *     trip) + a `sinon.spy()`-wrapped fake codec (asserts encode/decode
 *     called with the expected arguments).
 *
 * Out of scope: real wire delivery → `pubsub.integration.ts`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect, sinon} from '@loopback/testlab';
import {JsonCodec} from '../../providers/codec.provider';
import {NatsPublisher} from '../../services/nats-publisher.service';
import type {Codec} from '../../types';

interface FakeMsg {
  data: Uint8Array;
}

function fakeConn(opts: {requestResolves?: FakeMsg} = {}) {
  return {
    publish: sinon.stub(),
    request: sinon
      .stub()
      .resolves(opts.requestResolves ?? {data: new Uint8Array()}),
  };
}

describe('JsonCodec', () => {
  const c = new JsonCodec();

  it('encode/decode round-trips primitives', () => {
    expect(c.decode(c.encode('hello'))).to.equal('hello');
    expect(c.decode(c.encode(42))).to.equal(42);
    expect(c.decode(c.encode(true))).to.equal(true);
    expect(c.decode(c.encode(null))).to.equal(null);
  });

  it('encode/decode round-trips objects + arrays', () => {
    expect(c.decode(c.encode({a: 1, b: 'x'}))).to.deepEqual({a: 1, b: 'x'});
    expect(c.decode(c.encode([1, 2, 3]))).to.deepEqual([1, 2, 3]);
  });

  it('encode produces wire bytes equal to TextEncoder of JSON.stringify', () => {
    const wire = c.encode({hello: 'world'});
    const expected = new TextEncoder().encode('{"hello":"world"}');
    expect(Buffer.from(wire).equals(Buffer.from(expected))).to.be.true();
  });

  it('decode propagates JSON.parse errors (caller responsibility)', () => {
    const bad = new TextEncoder().encode('{not json');
    expect(() => c.decode(bad)).to.throw(Error, /codec decode failed/);
  });
});

describe('NatsPublisher', () => {
  describe('publish()', () => {
    it('encodes payload via codec and forwards to conn.publish with subject + reply', async () => {
      const conn = fakeConn();
      const codec = new JsonCodec();
      // tslint:disable-next-line: no-any
      const pub = new NatsPublisher(conn as any, codec);

      await pub.publish('orders.created', {id: 1});

      sinon.assert.calledOnce(conn.publish);
      const [subject, bytes, opts] = conn.publish.firstCall.args;
      expect(subject).to.equal('orders.created');
      expect(codec.decode(bytes)).to.deepEqual({id: 1});
      expect(opts).to.have.property('headers', undefined);
      expect(opts).to.have.property('reply', undefined);
    });

    it('forwards opts.reply to conn.publish', async () => {
      const conn = fakeConn();
      // tslint:disable-next-line: no-any
      const pub = new NatsPublisher(conn as any, new JsonCodec());
      await pub.publish('s', 'p', {reply: 'inbox.42'});
      const [, , opts] = conn.publish.firstCall.args;
      expect(opts.reply).to.equal('inbox.42');
    });

    it('forwards opts.headers to conn.publish unchanged (MsgHdrs passthrough)', async () => {
      const conn = fakeConn();
      // tslint:disable-next-line: no-any
      const pub = new NatsPublisher(conn as any, new JsonCodec());
      // tslint:disable-next-line: no-any
      const headers = {fakeHeaders: true} as any;
      await pub.publish('s', 'p', {headers});
      const [, , opts] = conn.publish.firstCall.args;
      expect(opts.headers).to.equal(headers);
    });

    it('invokes codec.encode with the original payload reference', async () => {
      const conn = fakeConn();
      const encode = sinon.spy((v: unknown) =>
        new TextEncoder().encode(JSON.stringify(v)),
      );
      const decode = sinon.spy((b: Uint8Array) =>
        JSON.parse(new TextDecoder().decode(b)),
      );
      const fakeCodec: Codec<unknown> = {
        encode: encode as unknown as Codec<unknown>['encode'],
        decode: decode as unknown as Codec<unknown>['decode'],
      };
      // tslint:disable-next-line: no-any
      const pub = new NatsPublisher(conn as any, fakeCodec);

      const payload = {original: 'object'};
      await pub.publish('s', payload);

      sinon.assert.calledOnce(encode);
      expect(encode.firstCall.args[0]).to.equal(payload);
      sinon.assert.notCalled(decode);
    });
  });

  describe('publishRaw()', () => {
    it('does NOT call codec.encode — raw bytes go straight through', async () => {
      const conn = fakeConn();
      const encode = sinon.spy((v: unknown) =>
        new TextEncoder().encode(JSON.stringify(v)),
      );
      const fakeCodec: Codec<unknown> = {
        encode: encode as unknown as Codec<unknown>['encode'],
        decode: () => undefined,
      };
      // tslint:disable-next-line: no-any
      const pub = new NatsPublisher(conn as any, fakeCodec);

      const raw = new Uint8Array([1, 2, 3]);
      await pub.publishRaw('s', raw);

      sinon.assert.notCalled(encode);
      const [subject, bytes] = conn.publish.firstCall.args;
      expect(subject).to.equal('s');
      expect(bytes).to.equal(raw);
    });
  });

  describe('request()', () => {
    it('encodes payload, calls conn.request, decodes response via codec', async () => {
      const codec = new JsonCodec();
      const conn = fakeConn({
        requestResolves: {data: codec.encode({ok: true})},
      });
      // tslint:disable-next-line: no-any
      const pub = new NatsPublisher(conn as any, codec);

      const res = await pub.request<{q: string}, {ok: boolean}>('rpc.echo', {
        q: 'hi',
      });

      sinon.assert.calledOnce(conn.request);
      const [subject, bytes, opts] = conn.request.firstCall.args;
      expect(subject).to.equal('rpc.echo');
      expect(codec.decode(bytes)).to.deepEqual({q: 'hi'});
      expect(opts.timeout).to.equal(5000);
      expect(res).to.deepEqual({ok: true});
    });

    it('forwards explicit timeout to conn.request', async () => {
      const codec = new JsonCodec();
      const conn = fakeConn({requestResolves: {data: codec.encode(null)}});
      // tslint:disable-next-line: no-any
      const pub = new NatsPublisher(conn as any, codec);

      await pub.request('rpc.echo', null, {timeout: 250});

      const [, , opts] = conn.request.firstCall.args;
      expect(opts.timeout).to.equal(250);
    });

    it('forwards noMux + reply + headers', async () => {
      const codec = new JsonCodec();
      const conn = fakeConn({requestResolves: {data: codec.encode(null)}});
      // tslint:disable-next-line: no-any
      const pub = new NatsPublisher(conn as any, codec);
      // tslint:disable-next-line: no-any
      const headers = {h: true} as any;

      await pub.request('rpc', null, {noMux: true, reply: 'inbox.x', headers});

      const [, , opts] = conn.request.firstCall.args;
      expect(opts.noMux).to.equal(true);
      expect(opts.reply).to.equal('inbox.x');
      expect(opts.headers).to.equal(headers);
    });
  });
});
