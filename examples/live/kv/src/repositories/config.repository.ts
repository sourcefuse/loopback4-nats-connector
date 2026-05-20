import {inject} from '@loopback/core';
import {
  JetStreamKvRepository,
  NatsConnectorComponentBindings as N,
  type Codec,
  type JetStreamClient,
} from 'loopback-nats-connector';

export interface ConfigEntry {
  value: unknown;
  description?: string;
  updatedAt?: number;
}

export class ConfigRepository extends JetStreamKvRepository<ConfigEntry> {
  constructor(
    @inject(N.JETSTREAM) js: JetStreamClient,
    @inject(N.CODEC) codec: Codec<unknown>,
  ) {
    super(js, codec, {bucket: 'config'});
  }
}
