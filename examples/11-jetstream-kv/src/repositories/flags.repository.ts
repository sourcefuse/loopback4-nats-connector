import {inject} from '@loopback/core';
import {
  JetStreamKvRepository,
  NatsConnectorComponentBindings as N,
  type Codec,
  type JetStreamClient,
} from 'loopback-nats-connector';

export interface FeatureFlag {
  enabled: boolean;
  rolloutPct?: number;
}

export class FlagsRepository extends JetStreamKvRepository<FeatureFlag> {
  constructor(
    @inject(N.JETSTREAM) js: JetStreamClient,
    @inject(N.CODEC) codec: Codec<unknown>,
  ) {
    super(js, codec, {bucket: 'feature-flags'});
  }
}
