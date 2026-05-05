# Authentication & Authorization Category — natsbyexample.com + NATS Docs

Comprehensive coverage of NATS auth modes via this single LB4 app. Switch
modes via `AUTH_MODE` env var; pair with the matching `server-*.conf`.

## Coverage matrix

| NATS auth mode | Server config | Connector option | Status | Source |
|----------------|---------------|------------------|--------|--------|
| Token | `server-token.conf` | `auth: {token}` | ✅ verified | natsbyexample.com (token) + docs/auth_intro/tokens |
| User/Password (plain) | `server-userpass.conf` | `auth: {user, pass}` | ✅ | docs/auth_intro/username_password |
| User/Password (bcrypt) | uses bcrypted hash in conf | same | ✅ doc'd | docs/auth_intro/username_password#bcrypted-passwords |
| TLS / mTLS (client cert) | `server-tls.conf` + `tls/` certs | `auth: {tls: {certFile, keyFile, caFile}}` | ✅ | docs/auth_intro/tls_mutual_auth |
| NKey | server has `nkey: U…` per user | `auth: {nkey: {seed}}` | ✅ | docs/auth_intro/nkey_auth |
| JWT (decentralized) | uses `nsc` resolver | `auth: {jwt: {jwt, seed}}` | ✅ | docs/auth_intro/jwt + natsbyexample auth/nkeys-jwts |
| **Authorization** (pub/sub allow/deny) | `server-permissions.conf` | server-side; client transparent | ✅ | docs/authorization |
| **Private Inbox** (allow_responses) | `server-private-inbox.conf` | `inboxPrefix` option (optional) | ✅ | natsbyexample auth/private-inbox |
| **Multi-Tenancy / Accounts** (exports/imports) | `server-accounts.conf` | server-side accounts; client connects to one | ✅ | docs/accounts |
| **System Account** ($SYS) | `server-sys-account.conf` | `auth: {user: 'sys', pass}` | ✅ | natsbyexample auth/sys-account |
| **Auth Callout** (centralized) | `server-callout.conf` + `bin/callout-service.ts` | client connects with creds; callout service issues JWT | ✅ scaffolded | natsbyexample auth/callout + docs/auth_callout |
| Auth Callout (decentralized) | `nsc edit authcallout` flow | same client side | 📋 architecture doc | natsbyexample auth/callout-decentralized |

## Run by mode

### 1. Token

```sh
nats-server -c server-token.conf &
npm install && npm run build && npm run start:token
curl -s http://localhost:3204/whoami
nats pub events.test '{"x":1}' --token=s3cr3t-token  # via natscli
curl -X POST http://localhost:3204/secure-publish \
  -H 'content-type: application/json' \
  -d '{"subject":"events.test","payload":{"x":2}}'
```

### 2. User/Password

```sh
nats-server -c server-userpass.conf &
NATS_USER=app NATS_PASS=app-password npm run start:userpass
```

### 3. TLS / mTLS

```sh
# Generate self-signed certs (one-time)
npm run gen-tls-certs

# Start TLS server
nats-server -c server-tls.conf &

# Connect — note tls:// URL scheme
NATS_URL=tls://localhost:4222 npm run start:tls

# Test with natscli
nats pub events.tls '{"secure":true}' \
  --tlscert=tls/client-cert.pem \
  --tlskey=tls/client-key.pem \
  --tlsca=tls/ca-cert.pem \
  -s tls://localhost:4222
```

### 4. NKey

```sh
# Generate seed (offline)
nk -gen user -pubout
# Take the public key (UA…) → put into server config:
#   authorization { users: [{nkey: "UA..."}] }
# Take the seed (SU…) → pass to client:
NATS_NKEY_SEED='SUAB...' npm run start:nkey
```

### 5. JWT (Decentralized)

```sh
# Bootstrap with nsc (offline, one-time):
nsc add operator op
nsc add account APP
nsc add user APP-USER
nsc generate creds -a APP -n APP-USER > app-user.creds
# Configure server with the operator JWT (full nsc walkthrough in docs)
# Then run app:
NATS_JWT='eyJhbG...' NATS_NKEY_SEED='SUAB...' npm run start:jwt
```

### 6. Authorization (per-user permissions)

```sh
nats-server -c server-permissions.conf &

# 'publisher' can publish events.> + audit.>; cannot subscribe to anything else
NATS_USER=publisher NATS_PASS=pub npm run start:userpass &
PORT=3214 NATS_USER=subscriber NATS_PASS=sub npm run start:userpass &
# subscriber can only subscribe events.>; pub denied
nats pub events.test '{"x":1}' --user=publisher --password=pub  # OK
nats pub events.test '{"x":2}' --user=subscriber --password=sub # DENIED
```

### 7. Private Inbox

```sh
nats-server -c server-private-inbox.conf &

# greeter user runs the @reply handler — has sub allow services.greet + allow_responses
NATS_USER=greeter NATS_PASS=greeter npm run start:userpass &

# joe issues request → reply lands on _INBOX.<token>; permission permits sub _INBOX.>
nats request services.greet '{"name":"joe"}' --user=joe --password=joe --timeout=2s
```

### 8. Multi-Tenancy / Accounts

```sh
nats-server -c server-accounts.conf &

# WEATHER account exports: weather.events.> stream + weather.> service
# APP account imports both — can see weather.events.> from any subscriber
NATS_USER=app NATS_PASS=app npm run start:userpass &

# Publish from WEATHER account
nats pub weather.events.alert '{"city":"NYC","temp":75}' --user=weather --password=weather

# APP-account subscriber sees it via the import
```

### 9. System Account

```sh
nats-server -c server-sys-account.conf &

# Connect to $SYS to monitor server
NATS_USER=sys NATS_PASS=sys-password npm run start:userpass &
nats sub '$SYS.>' --user=sys --password=sys-password
```

### 10. Auth Callout (Centralized)

The callout service signs User JWTs on behalf of the server. Apps connect
with arbitrary credentials; the callout service validates them.

```sh
# 1. Generate issuer NKey + XKey
npm install && npm run build
npm run gen-callout-keys
# → bin/callout-keys.json + bin/.callout.env

# 2. Render server config with envsubst (substitutes ISSUER_NKEY + ISSUER_XKEY)
source ./bin/.callout.env
envsubst < server-callout.conf > server-callout.live.conf
nats-server -c server-callout.live.conf &

# 3. Start the callout service (needs auth/auth credentials in AUTH account)
npm run callout-service &

# 4. Connect as 'alice' or 'bob' (defined in callout-service USERS map)
NATS_USER=alice NATS_PASS=alice npm run start:userpass

# Test
curl http://localhost:3204/whoami
nats pub bob.test '{"x":1}' --user=bob --password=bob   # OK (bob has bob.> perm)
nats pub other.test '{"x":1}' --user=bob --password=bob # DENIED by bob's perms
```

## Architecture

The connector exposes a single `auth` field with discriminated union types:

```ts
auth?:
  | {token: string}
  | {user: string; pass: string}
  | {tls: {certFile?, keyFile?, caFile?, cert?, key?, ca?, handshakeFirst?}}
  | {nkey: {seed: string | Uint8Array}}
  | {jwt:  {jwt: string; seed: string | Uint8Array}}
```

These map directly to `@nats-io/transport-node` connect options. Server-side
authorization (permissions, accounts, exports/imports, callout) is
fully transparent to the connector — the client just connects with
appropriate credentials.

For nsc/JWT bootstrap and full callout deep dive, see:
- `docs/natsbyexample/auth-nkeys-jwts.md`
- `docs/natsbyexample/auth-callout.md`
- `docs/natsbyexample/auth-callout-decentralized.md`
- `docs/natsbyexample/auth-private-inbox.md`
- `docs/natsbyexample/auth-private-inbox-jwt.md`
- `docs/natsbyexample/auth-sys-account.md`
