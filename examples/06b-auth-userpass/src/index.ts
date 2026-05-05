import {ApplicationConfig, UserPassAuthApp} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new UserPassAuthApp(options);
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
  const NATS_USER = process.env.NATS_USER ?? 'alice';
  const NATS_PASS = process.env.NATS_PASS ?? 'secret';
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3007),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {
        setServersFromRequest: true,
      },
    },
    nats: {
      servers: [NATS_URL],
      auth: {user: NATS_USER, pass: NATS_PASS},
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
