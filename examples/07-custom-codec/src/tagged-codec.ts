import type {Codec} from 'loopback-nats-connector';

/**
 * TaggedCodec — trivial non-JSON-shaped wire format.
 *
 * Wire layout: [0xAA][utf8(JSON.stringify(value))]
 *
 * Demonstrates that `Codec<T>` is the public contract for end-to-end
 * encoding. Real consumers would plug in MessagePack, CBOR, Protobuf,
 * Avro, etc. by implementing the same two-method interface.
 */
export const TAGGED_MAGIC = 0xaa;

export class TaggedCodec<T = unknown> implements Codec<T> {
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder();

  encode(value: T): Uint8Array {
    const json = this.enc.encode(JSON.stringify(value));
    const out = new Uint8Array(json.length + 1);
    out[0] = TAGGED_MAGIC;
    out.set(json, 1);
    return out;
  }

  decode(bytes: Uint8Array): T {
    if (bytes[0] !== TAGGED_MAGIC) {
      throw new Error('TaggedCodec: missing magic byte');
    }
    return JSON.parse(this.dec.decode(bytes.subarray(1))) as T;
  }
}
