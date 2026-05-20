import {ApplicationConfig, FilterApp} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new FilterApp(options);
  await app.boot();
  await app.start();
  const url = app.restServer.url;
  console.log(`REST server running at ${url}`);
  const nats = (options as {nats?: {servers: string[]}}).nats;
  console.log(
    `NATS connected to ${nats?.servers?.[0] ?? 'unknown'} (JetStream)`,
  );
  return app;
}

if (require.main === module) {
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3015),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {setServersFromRequest: true},
    },
    nats: {
      servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
      jetstream: {},
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
