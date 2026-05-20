/**
 * Default codec — JSON over TextEncoder/TextDecoder.
 *
 * Consumers override per connection by re-binding `N.codec(<name>)`.
 *
 * Design note: distinct from nats.js `JSONCodec` / `StringCodec`. The
 * extension owns the codec contract so consumers can plug arbitrary
 * encoders (protobuf, msgpack, custom binary) without depending on
 * nats.js codec internals. Wrapping nats.js codecs is a one-liner.
 *
 * See:
 *   - docs/plan/04-public-api.md §Codec<T>
 *   - docs/plan/05-internals.md  §providers/codec.provider.ts
 */
import type {Codec} from '../types';

export class JsonCodec<T = unknown> implements Codec<T> {
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder();

  encode(value: T): Uint8Array {
    return this.enc.encode(JSON.stringify(value));
  }

  decode(bytes: Uint8Array): T {
    const text = this.dec.decode(bytes);
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new Error(
        `[nats] codec decode failed (JSON): ${(err as Error).message}`,
      );
    }
  }
}
