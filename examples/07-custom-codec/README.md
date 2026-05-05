# 07 — custom-codec

Custom binary codec via `publishRaw`. TaggedCodec prepends `0xAA` magic byte before JSON. Bytes-on-wire are NOT JSON.

## Ports

- NATS: `4222`
- REST: `3008`

## Run

**Terminal 1** — broker:
```sh
nats-server -c server.conf
```

**Terminal 2** — app:
```sh
npm install
npm run build
npm start
```

**Terminal 3** — sniff raw bytes:
```sh
nats --server=nats://127.0.0.1:4222 sub audit.tag --raw
```

**Terminal 4** — trigger publish via REST:
```sh
curl 'http://localhost:3008/echo/audit.tag?payload=hello'
```

Response:
```json
{"publishedTo":"audit.tag","magicByte":"0xaa","bytesHex":"aa7b226563686f6564223a2268656c6c6f227d"}
```

Terminal 3 subscriber receives the raw bytes — first byte `0xaa`, body is JSON `{"echoed":"hello"}`.

App stdout shows:
```
[EchoController] publishRaw → audit.tag magic=0xaa bytes=aa7b...
```

## Files

- `server.conf` — basic broker.
- `src/application.ts` — `CodecApp` registering NATS component.
- `src/tagged-codec.ts` — `Codec<T>` impl with magic byte + JSON.
- `src/controllers/echo.controller.ts` — `@get('/echo/:subject')` REST endpoint that calls `publisher.publishRaw`.
- `src/index.ts` — boots app on port 3008.

## Prereqs

`nats-server` + `nats` CLI.
