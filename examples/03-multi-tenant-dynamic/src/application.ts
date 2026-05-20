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

export interface TenantAppOptions extends ApplicationConfig {
  nats?: {connections?: Record<string, unknown>};
}

/**
 * App with NO static connections — every connection is opened at
 * runtime via NatsConnectionRegistry. The FleetController's
 * `@subscribe(..., {connection: '*'})` handlers attach to every
 * tenant the registry adds.
 */
export class TenantApp extends BootMixin(RestApplication) {
  constructor(options: TenantAppOptions = {}) {
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    // Wire the NATS connector. `nats` field on options is consumed here;
    // anything else is left to RestApplication.
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
