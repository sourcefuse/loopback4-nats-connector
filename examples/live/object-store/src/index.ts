import {ApplicationConfig, ObjectStoreApp} from './application';
export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new ObjectStoreApp(options);
  await app.boot();
  await app.start();
  console.log(`REST at ${app.restServer.url}`);
  console.log('Object Store bucket: files (auto-created on first PUT)');
  return app;
}
if (require.main === module) {
  main({
    rest: {port: +(process.env.PORT ?? 3203), host: '127.0.0.1', gracePeriodForClose: 5000, openApiSpec: {setServersFromRequest: true}},
    nats: {servers: [process.env.NATS_URL ?? 'nats://localhost:4222'], jetstream: {}},
  }).catch(err => { console.error(err); process.exit(1); });
}
