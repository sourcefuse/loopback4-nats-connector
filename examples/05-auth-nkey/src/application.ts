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
  NatsConnectorComponentOptions,
} from 'loopback-nats-connector';

export {ApplicationConfig};

export interface NkeyAppOptions extends ApplicationConfig {
  nats?: NatsConnectorComponentOptions;
}

export class NkeyApp extends BootMixin(RestApplication) {
  constructor(options: NkeyAppOptions = {}) {
    super(options);

    this.sequence(MySequence);

    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    if (options.nats) {
      this.configure(NatsConnectorComponentBindings.COMPONENT).to(options.nats);
    }
    this.component(NatsConnectorComponent);

    this.projectRoot = __dirname;
    this.bootOptions = {
      controllers: {
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };
  }
}
