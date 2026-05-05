import {ApplicationConfig, IsoApp} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new IsoApp(options);
  await app.boot();
  await app.start();
  const url = app.restServer.url;
  console.log(`REST server running at ${url}`);
  const nats = (
    options as {
      nats?: {connections: Record<string, {servers: string[]}>};
    }
  ).nats;
  for (const [name, c] of Object.entries(nats?.connections ?? {})) {
    console.log(`NATS '${name}' → ${c.servers[0]} (JetStream)`);
  }
  return app;
}

if (require.main === module) {
  const aUrl = process.env.A_NATS_URL ?? 'nats://localhost:4222';
  const bUrl = process.env.B_NATS_URL ?? 'nats://localhost:4223';
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3016),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {setServersFromRequest: true},
    },
    nats: {
      connections: {
        a: {servers: [aUrl], jetstream: {}},
        b: {servers: [bUrl], jetstream: {}},
      },
      default: 'a',
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
