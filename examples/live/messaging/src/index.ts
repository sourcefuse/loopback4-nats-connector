import {ApplicationConfig, MessagingApp} from './application';
export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new MessagingApp(options);
  await app.boot();
  await app.start();
  console.log(`REST at ${app.restServer.url}`);
  console.log('Messaging examples loaded:');
  console.log('  - pub-sub: events.>, news.*');
  console.log('  - request-reply: time.now, math.calc');
  console.log('  - JSON payload: data.orders, order.validate');
  console.log('  - queue-group: tasks.work [queue=workers]');
  return app;
}

if (require.main === module) {
  main({
    rest: {port: +(process.env.PORT ?? 3200), host: '127.0.0.1', gracePeriodForClose: 5000, openApiSpec: {setServersFromRequest: true}},
    nats: {servers: [process.env.NATS_URL ?? 'nats://localhost:4222']},
  }).catch(err => { console.error(err); process.exit(1); });
}
