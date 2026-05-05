import {ApplicationConfig, JetStreamApp} from './application';
export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new JetStreamApp(options);
  await app.boot();
  await app.start();
  console.log(`REST at ${app.restServer.url}`);
  console.log('JetStream demos: see README.md');
  return app;
}

if (require.main === module) {
  const auth = process.env.NATS_USER
    ? {user: process.env.NATS_USER, pass: process.env.NATS_PASS}
    : undefined;
  main({
    rest: {port: +(process.env.PORT ?? 3201), host: '127.0.0.1', gracePeriodForClose: 5000, openApiSpec: {setServersFromRequest: true}},
    nats: {
      servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
      jetstream: {},
      ...(auth ? {auth} : {}),
    },
  } as any).catch(err => { console.error(err); process.exit(1); });
}
