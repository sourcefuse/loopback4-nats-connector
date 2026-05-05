import {injectable, inject, BindingScope} from '@loopback/core';
import {NatsConnectorComponentBindings as N, type JetStreamClient} from 'loopback-nats-connector';
import {Objm, type ObjectStore, type ObjectInfo} from '@nats-io/obj';

/**
 * Object Store service wrapping @nats-io/obj. The connector does not
 * provide a base class for OS yet (only KV) — this is the recommended
 * service pattern.
 *
 * Bucket auto-created on first put.
 */
@injectable({scope: BindingScope.SINGLETON})
export class FileStorageService {
  private os?: ObjectStore;

  constructor(@inject(N.JETSTREAM) private js: JetStreamClient) {}

  private async getOs(): Promise<ObjectStore> {
    if (!this.os) {
      const objm = new Objm(this.js as any);
      this.os = await objm.create('files');
    }
    return this.os;
  }

  async put(name: string, data: Uint8Array, description?: string): Promise<ObjectInfo> {
    const os = await this.getOs();
    return os.put({name, description}, readableStreamFromBytes(data));
  }

  async get(name: string): Promise<Uint8Array | null> {
    const os = await this.getOs();
    try {
      const obj = await os.get(name);
      if (!obj) return null;
      return await readAllBytes(obj.data);
    } catch {
      return null;
    }
  }

  async delete(name: string): Promise<void> {
    const os = await this.getOs();
    await os.delete(name);
  }

  async list(): Promise<ObjectInfo[]> {
    const os = await this.getOs();
    return os.list();
  }

  async info(name: string): Promise<ObjectInfo | null> {
    const os = await this.getOs();
    try {
      return (await os.info(name)) ?? null;
    } catch {
      return null;
    }
  }
}

function readableStreamFromBytes(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
