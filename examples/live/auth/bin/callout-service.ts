/**
 * Auth Callout Service (Centralized).
 *
 * Pattern from natsbyexample.com/examples/auth/callout
 *
 * Listens on `$SYS.REQ.USER.AUTH`, validates against an in-memory user
 * directory, signs a User JWT via the issuer NKey, wraps it in an
 * Authorization Response JWT, encrypts with the server's per-connection
 * XKey (if xkey is configured server-side), and responds.
 *
 * Run:
 *   1. npm run gen-callout-keys
 *   2. source bin/.callout.env
 *   3. envsubst < server-callout.conf > server-callout.live.conf
 *   4. nats-server -c server-callout.live.conf &
 *   5. npm run callout-service        (starts THIS service)
 *   6. AUTH_MODE=userpass NATS_USER=alice NATS_PASS=alice npm start
 *
 * Test users (in USERS map below):
 *   alice / alice  — APP account, full perms
 *   bob   / bob    — APP account, restricted to bob.>
 *   sys   / sys    — SYS account
 */
import * as fs from 'fs';
import * as path from 'path';
import {connect} from '@nats-io/transport-node';
import {fromSeed, fromPublic, fromCurveSeed} from '@nats-io/nkeys';
import {
  decode,
  encodeUser,
  encodeAuthorizationResponse,
  Algorithms,
} from '@nats-io/jwt';

interface UserRec {
  pass: string;
  account: string;
  permissions?: any;
}
const USERS: Record<string, UserRec> = {
  alice: {pass: 'alice', account: 'APP'},
  bob: {
    pass: 'bob',
    account: 'APP',
    permissions: {pub: {allow: ['bob.>']}, sub: {allow: ['bob.>', '_INBOX.>']}},
  },
  sys: {pass: 'sys', account: 'SYS'},
};

async function main() {
  const keysFile = path.join(__dirname, 'callout-keys.json');
  if (!fs.existsSync(keysFile)) {
    console.error(
      'Missing bin/callout-keys.json — run `npm run gen-callout-keys` first',
    );
    process.exit(1);
  }
  const keys = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
  const issuer = fromSeed(new TextEncoder().encode(keys.issuerSeed));
  const xkey = fromCurveSeed(new TextEncoder().encode(keys.issuerXseed));

  const url = process.env.NATS_URL ?? 'nats://localhost:4222';
  const nc = await connect({servers: url, user: 'auth', pass: 'auth'});
  console.log('[callout] auth/auth connected, subscribing $SYS.REQ.USER.AUTH');

  const sub = nc.subscribe('$SYS.REQ.USER.AUTH');
  for await (const msg of sub) {
    try {
      // Incoming JWT may be xkey-encrypted (when server has xkey configured).
      // Server includes its per-connection xkey in the request claim.
      let raw = msg.data;
      // If first byte indicates encryption (XKey envelope) — decrypt.
      // For simplicity here we attempt decode; if it fails on encryption, we try unseal.
      let claim;
      try {
        claim = decode<any>(new TextDecoder().decode(raw));
      } catch {
        // Encrypted: msg.headers contains 'Nats-Server-Xkey' for sealing-back
        const serverXkey = msg.headers?.get('Nats-Server-Xkey') ?? '';
        if (!serverXkey)
          throw new Error('encrypted request without server xkey');
        const decrypted = xkey.open(raw, serverXkey);
        if (!decrypted) throw new Error('xkey decrypt failed');
        claim = decode<any>(new TextDecoder().decode(decrypted));
      }

      const req = claim.nats;
      const userClaim = req.connect_opts.user ?? '';
      const pass = req.connect_opts.pass ?? '';
      const userNkey = req.user_nkey;
      const serverId = req.server_id.id;
      const serverXkey = req.server_id.xkey;

      const rec = USERS[userClaim];
      const ok = rec && rec.pass === pass;
      console.log(
        `[callout] req user=${userClaim} → ${ok ? 'OK (' + rec!.account + ')' : 'DENY'}`,
      );

      const userKey = fromPublic(userNkey);
      const serverKey = fromPublic(serverId);

      let respJwt: string;
      if (ok) {
        const userJwt = await encodeUser(
          userClaim,
          userKey,
          issuer,
          {permissions: rec!.permissions} as any,
          {algorithm: Algorithms.v2},
        );
        respJwt = await encodeAuthorizationResponse(
          userKey,
          serverKey,
          issuer,
          {jwt: userJwt},
          {algorithm: Algorithms.v2},
        );
      } else {
        respJwt = await encodeAuthorizationResponse(
          userKey,
          serverKey,
          issuer,
          {error: 'invalid credentials'},
          {algorithm: Algorithms.v2},
        );
      }

      // Optionally encrypt response back to server's per-connection xkey
      let outBytes: Uint8Array = new TextEncoder().encode(respJwt);
      if (serverXkey) {
        outBytes = xkey.seal(outBytes, serverXkey);
      }
      msg.respond(outBytes);
    } catch (err) {
      console.error('[callout] error:', (err as Error).message);
    }
  }
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
