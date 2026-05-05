import {ApplicationConfig, StatusApp} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new StatusApp(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  console.log(`REST server running at ${url}`);
  console.log(
    `NATS connected to ${(options as {nats?: {servers: string[]}}).nats?.servers?.[0] ?? 'unknown'}`,
  );

  // Force StatusController instantiation at boot so its EventEmitter
  // listeners are attached BEFORE any disconnect/reconnect fires. LB4
  // controllers are otherwise request-scoped and would not run their
  // constructor until an HTTP request hits them.
  await app.get('controllers.StatusController');
  console.log('[StatusController] event listeners attached');

  return app;
}

if (require.main === module) {
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3009),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {
        setServersFromRequest: true,
      },
    },
    nats: {
      servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
      reconnect: {
        maxReconnectAttempts: 5,
        reconnectTimeWait: 500,
        pingInterval: 2000,
      },
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
