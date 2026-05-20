import {ApplicationConfig, TenantApp} from './application';
import {NatsConnectorComponentBindings} from 'loopback-nats-connector';

export * from './application';

export interface TenantMainOptions extends ApplicationConfig {
  nats?: {connections?: Record<string, unknown>};
  tenants?: Array<{name: string; servers: string[]}>;
}

export async function main(options: TenantMainOptions = {}) {
  const app = new TenantApp(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  console.log(`REST server running at ${url}`);

  // Pull the registry and register tenants dynamically.
  const registry = await app.get(NatsConnectorComponentBindings.REGISTRY);
  const tenants = options.tenants ?? [];
  for (const t of tenants) {
    try {
      await registry.add(t.name, {servers: t.servers});
      console.log(
        `[registry] added tenant '${t.name}' → ${t.servers.join(',')}`,
      );
    } catch (err) {
      console.error(
        `[registry] FAILED to add tenant '${t.name}' (${t.servers.join(',')}):`,
        (err as Error).message,
      );
    }
  }

  return app;
}

if (require.main === module) {
  const config: TenantMainOptions = {
    rest: {
      port: +(process.env.PORT ?? 3003),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {
        setServersFromRequest: true,
      },
    },
    // Empty connections map — registry-only / dynamic. Static
    // connections could be added here as a baseline if desired.
    nats: {connections: {}},
    tenants: [
      {
        name: 'tenant-a',
        servers: [process.env.TENANT_A_URL ?? 'nats://localhost:4223'],
      },
      {
        name: 'tenant-b',
        servers: [process.env.TENANT_B_URL ?? 'nats://localhost:4224'],
      },
    ],
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
