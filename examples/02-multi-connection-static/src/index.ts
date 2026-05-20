import {ApplicationConfig, MultiConnApp} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new MultiConnApp(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  const nats = (
    options as {
      nats?: {connections: Record<string, {servers: string[]}>};
    }
  ).nats;
  console.log(`REST server running at ${url}`);
  if (nats?.connections) {
    for (const [name, cfg] of Object.entries(nats.connections)) {
      console.log(
        `NATS '${name}' connected to ${cfg.servers?.[0] ?? 'unknown'}`,
      );
    }
  }
  return app;
}

if (require.main === module) {
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3002),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {
        setServersFromRequest: true,
      },
    },
    nats: {
      connections: {
        internal: {
          servers: [process.env.INTERNAL_NATS_URL ?? 'nats://localhost:4222'],
        },
        ingress: {
          servers: [process.env.INGRESS_NATS_URL ?? 'nats://localhost:4223'],
        },
      },
      default: 'internal',
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
