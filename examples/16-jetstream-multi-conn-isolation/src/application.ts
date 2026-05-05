import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {RestApplication} from '@loopback/rest';
import {MySequence} from './sequence';
import {
  NatsConnectorComponent,
  NatsConnectorComponentBindings,
} from 'loopback-nats-connector';

export {ApplicationConfig};

export interface IsoAppOptions extends ApplicationConfig {
  nats?: {
    connections: Record<string, {servers: string[]; jetstream?: object}>;
    default?: string;
  };
}

/**
 * Two named NATS connections, each with JetStream enabled, pointing at
 * separate brokers. Used to prove JetStream context isolation: a stream
 * named ALPHA on broker A is fully independent of a same-named stream
 * on broker B, and a @jsConsume bound to one connection never sees
 * messages produced into the other broker's stream.
 */
export class IsoApp extends BootMixin(RestApplication) {
  constructor(options: IsoAppOptions = {}) {
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    if (options.nats) {
      this.configure(NatsConnectorComponentBindings.COMPONENT).to(options.nats);
    }
    this.component(NatsConnectorComponent);

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };
  }
}
