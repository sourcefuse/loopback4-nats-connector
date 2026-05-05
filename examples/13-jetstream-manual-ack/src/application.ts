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

export interface ManualAckAppOptions extends ApplicationConfig {
  nats?: {servers: string[]; jetstream?: object};
}

export class ManualAckApp extends BootMixin(RestApplication) {
  constructor(options: ManualAckAppOptions = {}) {
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    // Wire the NATS connector with JetStream enabled.
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
