import {inject} from '@loopback/core';
import {del, get, param, put, requestBody} from '@loopback/rest';
import {ConfigRepository, ConfigEntry} from '../repositories/config.repository';

/**
 * Key-Value Store category — natsbyexample.com/examples/kv/intro
 *
 * Demonstrates:
 *  - JetStreamKvRepository<T>: typed KV backed by JetStream stream KV_<bucket>
 *  - put/get/delete operations
 *  - JSON codec applied automatically (configured at component level)
 *  - Bucket auto-created on first put
 */
export class ConfigController {
  constructor(
    @inject('repositories.ConfigRepository') private repo: ConfigRepository,
  ) {}

  @get('/config/{key}')
  async getEntry(
    @param.path.string('key') key: string,
  ): Promise<{key: string; entry: ConfigEntry | null}> {
    const entry = await this.repo.get(key);
    console.log(
      `[kv] GET config/${key} → ${entry ? JSON.stringify(entry) : 'null'}`,
    );
    return {key, entry: entry ?? null};
  }

  @put('/config/{key}')
  async putEntry(
    @param.path.string('key') key: string,
    @requestBody() entry: ConfigEntry,
  ): Promise<{key: string; entry: ConfigEntry}> {
    entry.updatedAt = Date.now();
    await this.repo.put(key, entry);
    console.log(`[kv] PUT config/${key}: ${JSON.stringify(entry)}`);
    return {key, entry};
  }

  @del('/config/{key}')
  async deleteEntry(
    @param.path.string('key') key: string,
  ): Promise<{key: string; deleted: true}> {
    await this.repo.delete(key);
    console.log(`[kv] DELETE config/${key} (tombstone)`);
    return {key, deleted: true};
  }
}
