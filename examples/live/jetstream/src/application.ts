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

export class JetStreamApp extends BootMixin(RestApplication) {
  constructor(options: ApplicationConfig = {}) {
    super(options);
    this.sequence(MySequence);
    this.configure(RestExplorerBindings.COMPONENT).to({path: '/explorer'});
    this.component(RestExplorerComponent);
    const nats = (options as any).nats;
    if (nats) this.configure(NatsConnectorComponentBindings.COMPONENT).to(nats);
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
