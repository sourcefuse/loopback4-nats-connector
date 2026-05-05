import {inject} from '@loopback/core';
import {get, param} from '@loopback/rest';
import {
  NatsConnectorComponentBindings as N,
  NatsPublisher,
} from 'loopback-nats-connector';
import {TaggedCodec} from '../tagged-codec';

/**
 * Demonstrates `publishRaw` — a custom binary codec (TaggedCodec) prepends
 * the magic byte 0xAA before JSON; bytes go to the wire untouched.
 *
 * Try it (with broker + npm start):
 *   curl 'http://localhost:3008/echo/audit.tag?payload=hello'
 *
 * In another terminal:
 *   nats --server=nats://localhost:4222 sub audit.tag --raw
 *   → first byte of every message is 0xAA (170 decimal).
 */
export class EchoController {
  private readonly codec = new TaggedCodec<unknown>();

  constructor(@inject(N.PUBLISHER) private readonly publisher: NatsPublisher) {}

  @get('/echo/{subject}')
  async emit(
    @param.path.string('subject') subject: string,
    @param.query.string('payload') payload?: string,
  ): Promise<{publishedTo: string; magicByte: string; bytesHex: string}> {
    const obj = {echoed: payload ?? 'hello'};
    const bytes = this.codec.encode(obj);
    await this.publisher.publishRaw(subject, bytes);
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    console.log(
      `[EchoController] publishRaw → ${subject} magic=0x${bytes[0].toString(16)} bytes=${hex}`,
    );
    return {
      publishedTo: subject,
      magicByte: '0x' + bytes[0].toString(16),
      bytesHex: hex,
    };
  }
}
