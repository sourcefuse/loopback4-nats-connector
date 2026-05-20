import {ApplicationConfig, TokenAuthApp} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new TokenAuthApp(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  const nats = (options as {nats?: {servers: string[]}}).nats;
  console.log(`REST server running at ${url}`);
  console.log(`NATS connected to ${nats?.servers?.[0] ?? 'unknown'}`);
  return app;
}

if (require.main === module) {
  const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
  const NATS_TOKEN = process.env.NATS_TOKEN ?? 's3cr3t';
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3006),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {
        setServersFromRequest: true,
      },
    },
    nats: {
      servers: [NATS_URL],
      auth: {token: NATS_TOKEN},
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
