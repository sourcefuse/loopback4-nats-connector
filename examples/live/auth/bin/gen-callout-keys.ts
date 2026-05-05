/**
 * Generates an issuer NKey (account signing key) + XKey (encryption key)
 * for the auth callout service.
 *
 * Outputs:
 *   bin/callout-keys.json  — pub keys + seeds (used by callout service)
 *   bin/.callout.env       — exports for envsubst into server-callout.conf
 */
import * as fs from 'fs';
import * as path from 'path';
import {createAccount, createCurve} from '@nats-io/nkeys';

async function main() {
  const account = createAccount();
  const xkey = createCurve();

  const issuerNkey  = account.getPublicKey();
  const issuerSeed  = new TextDecoder().decode(account.getSeed());
  const issuerXkey  = xkey.getPublicKey();
  const issuerXseed = new TextDecoder().decode(xkey.getSeed());

  const out = {issuerNkey, issuerSeed, issuerXkey, issuerXseed};
  fs.writeFileSync(path.join(__dirname, 'callout-keys.json'),
    JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(__dirname, '.callout.env'),
    `export ISSUER_NKEY=${issuerNkey}\nexport ISSUER_XKEY=${issuerXkey}\n`);

  console.log('issuerNkey:', issuerNkey);
  console.log('issuerXkey:', issuerXkey);
  console.log('files: bin/callout-keys.json, bin/.callout.env');
}
main().catch(err => { console.error(err); process.exit(1); });
