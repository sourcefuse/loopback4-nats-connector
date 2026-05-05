import * as path from 'path';
import {ApplicationConfig, AuthApp} from './application';
export * from './application';

type AuthMode = 'token' | 'userpass' | 'nkey' | 'jwt' | 'tls';

function buildAuth(mode: AuthMode): unknown {
  switch (mode) {
    case 'userpass':
      return {user: process.env.NATS_USER ?? 'app', pass: process.env.NATS_PASS ?? 'app-password'};
    case 'nkey':
      return {nkey: {seed: process.env.NATS_NKEY_SEED ?? ''}};
    case 'jwt':
      return {jwt: {jwt: process.env.NATS_JWT ?? '', seed: process.env.NATS_NKEY_SEED ?? ''}};
    case 'tls':
      return {
        tls: {
          certFile: process.env.NATS_TLS_CERT ?? path.join(__dirname, '..', '..', '..', 'tls', 'client-cert.pem'),
          keyFile:  process.env.NATS_TLS_KEY  ?? path.join(__dirname, '..', '..', '..', 'tls', 'client-key.pem'),
          caFile:   process.env.NATS_TLS_CA   ?? path.join(__dirname, '..', '..', '..', 'tls', 'ca-cert.pem'),
        },
      };
    case 'token':
    default:
      return {token: process.env.NATS_TOKEN ?? 's3cr3t-token'};
  }
}

export async function main(options: ApplicationConfig = {}) {
  const app = new AuthApp(options);
  await app.boot();
  await app.start();
  console.log(`REST at ${app.restServer.url}`);
  console.log(`Auth mode: ${process.env.AUTH_MODE ?? 'token'}`);
  return app;
}
if (require.main === module) {
  const mode = (process.env.AUTH_MODE ?? 'token') as AuthMode;
  const url = process.env.NATS_URL ?? (mode === 'tls' ? 'tls://127.0.0.1:4222' : 'nats://127.0.0.1:4222');
  main({
    rest: {port: +(process.env.PORT ?? 3204), host: '127.0.0.1', gracePeriodForClose: 5000, openApiSpec: {setServersFromRequest: true}},
    nats: {
      servers: [url],
      auth: buildAuth(mode),
      ...(process.env.INBOX_PREFIX ? {inboxPrefix: process.env.INBOX_PREFIX} : {}),
    },
  }).catch(err => { console.error(err); process.exit(1); });
}
