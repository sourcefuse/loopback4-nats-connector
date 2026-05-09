import {ApplicationConfig, KvApp} from './application';
export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new KvApp(options);
  await app.boot();
  await app.start();
  console.log(`REST at ${app.restServer.url}`);
  console.log('KV bucket: config (auto-created on first PUT)');
  return app;
}
if (require.main === module) {
  main({
    rest: {
      port: +(process.env.PORT ?? 3202),
      host: '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {setServersFromRequest: true},
    },
    nats: {
      servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
      jetstream: {},
    },
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
