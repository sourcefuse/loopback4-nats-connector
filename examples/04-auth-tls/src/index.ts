import {ApplicationConfig, TlsApp} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new TlsApp(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  console.log(`REST server running at ${url}`);
  console.log(
    `NATS connected to ${(options as {nats?: {servers: string[]}}).nats?.servers?.[0] ?? 'unknown'}`,
  );
  return app;
}

if (require.main === module) {
  const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3004),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {
        setServersFromRequest: true,
      },
    },
    nats: {
      servers: [NATS_URL],
      auth: {
        tls: {
          certFile: 'creds/client.crt',
          keyFile: 'creds/client.key',
          caFile: 'creds/ca.crt',
        },
      },
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
