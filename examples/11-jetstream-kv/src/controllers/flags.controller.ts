import {inject} from '@loopback/core';
import {del, get, param, put, requestBody} from '@loopback/rest';
import {FlagsRepository, FeatureFlag} from '../repositories/flags.repository';

/**
 * REST wrapper around the JetStreamKvRepository<FeatureFlag>. Lets users
 * verify KV ops via plain curl.
 *
 * Try it:
 *   curl -X PUT http://localhost:3011/flags/checkout-v2 \
 *        -H 'content-type: application/json' \
 *        -d '{"enabled":true,"rolloutPct":50}'
 *   curl http://localhost:3011/flags/checkout-v2
 *   curl -X DELETE http://localhost:3011/flags/checkout-v2
 *   curl http://localhost:3011/flags/checkout-v2
 */
export class FlagsController {
  constructor(
    @inject('repositories.FlagsRepository')
    private readonly repo: FlagsRepository,
  ) {}

  @get('/flags/{key}')
  async fetch(
    @param.path.string('key') key: string,
  ): Promise<{key: string; value: FeatureFlag | null}> {
    const value = await this.repo.get(key);
    console.log(
      `[FlagsController] GET /flags/${key} → ${JSON.stringify(value ?? null)}`,
    );
    return {key, value: value ?? null};
  }

  @put('/flags/{key}')
  async upsert(
    @param.path.string('key') key: string,
    @requestBody() body: FeatureFlag,
  ): Promise<{key: string; value: FeatureFlag}> {
    await this.repo.put(key, body);
    console.log(
      `[FlagsController] PUT /flags/${key} → ${JSON.stringify(body)}`,
    );
    return {key, value: body};
  }

  @del('/flags/{key}')
  async remove(
    @param.path.string('key') key: string,
  ): Promise<{key: string; deleted: true}> {
    await this.repo.delete(key);
    console.log(`[FlagsController] DELETE /flags/${key}`);
    return {key, deleted: true};
  }
}
