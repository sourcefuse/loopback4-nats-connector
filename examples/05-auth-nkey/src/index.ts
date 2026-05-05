import fs from 'fs';
import path from 'path';
import {ApplicationConfig, NkeyApp} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new NkeyApp(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  console.log(`Server is running at ${url}`);
  console.log(`Try ${url}/ping`);

  return app;
}

if (require.main === module) {
  const seedPath = path.resolve(process.cwd(), 'creds/user.seed');
  const seed = fs.readFileSync(seedPath, 'utf8').trim();

  const config = {
    rest: {
      port: +(process.env.PORT ?? 3005),
      host: process.env.HOST ?? '127.0.0.1',
      gracePeriodForClose: 5000,
      openApiSpec: {
        setServersFromRequest: true,
      },
    },
    nats: {
      servers: [process.env.NATS_URL ?? 'nats://localhost:4222'],
      auth: {nkey: {seed}},
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
