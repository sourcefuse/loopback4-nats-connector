# 📦 Object Store — natsbyexample.com Recreations

> NATS Object Store — chunked file storage on JetStream.
> LB4 app on **port 3203**. Files stored as multiple chunks in stream `OBJ_files`.

| natsbyexample example | What it shows | Code |
|------------------------|---------------|------|
| [Object-Store Intro](https://natsbyexample.com/examples/os/intro/python) | put/get/list/info/delete chunked binary objects via `@nats-io/obj` | [`src/services/file-storage.service.ts`](./src/services/file-storage.service.ts) + [`src/controllers/files.controller.ts`](./src/controllers/files.controller.ts) |

The connector currently has no `JetStreamObjectRepository<T>` base class
(only KV). This example uses an injectable `FileStorageService` that wraps
`@nats-io/obj` directly — recommended pattern until/unless an OS base
class lands.

---

## 🚀 Run

```sh
# 1. JetStream-enabled server
nats-server -js &

# 2. Build + start (no provision step — bucket auto-created on first PUT)
npm install && npm run build && npm start
# → REST at http://127.0.0.1:3203
```

---

## 🧪 Test scenarios

### 1. Put a file

```sh
curl -X POST http://localhost:3203/files \
  -H 'content-type: application/json' \
  -d '{"name":"hello.txt","content":"Hello, NATS object store!","description":"greeting"}'
# → {"name":"hello.txt","size":25,"chunks":1,"mtime":"2026-..."}
```

Bucket `files` is auto-created if not present (lazy init in `FileStorageService.getOs()`).

### 2. Get content

```sh
curl -s http://localhost:3203/files/hello.txt | jq .
# → {"name":"hello.txt","content":"Hello, NATS object store!"}

# Missing file
curl -s http://localhost:3203/files/missing.txt | jq .
# → {"found":false}
```

### 3. Object info (size, chunks, metadata)

```sh
curl -s http://localhost:3203/files/hello.txt/info | jq .
# → {"name":"hello.txt","size":25,"chunks":1,"mtime":"...","deleted":false}
```

### 4. List all objects

```sh
curl -s http://localhost:3203/files | jq .
# → {"count":N,"items":[{"name":"hello.txt","size":25,"chunks":1}, ...]}
```

### 5. Delete

```sh
curl -X DELETE http://localhost:3203/files/hello.txt
# → {"name":"hello.txt","deleted":true}

curl -s http://localhost:3203/files/hello.txt | jq .
# → {"found":false}
```

### 6. natscli inspection

```sh
# Direct OS access
nats object ls files
nats object info files hello.txt
nats object put files ./localfile.bin
nats object get files localfile.bin

# Underlying JetStream stream
nats stream info OBJ_files
```

### 7. Large file / chunking

```sh
# Create a 1 MB file
dd if=/dev/urandom of=/tmp/big.bin bs=1M count=1 2>/dev/null
nats object put files /tmp/big.bin

# Inspect chunks (default chunk_size = 128 KB, so 1 MB = ~8 chunks)
nats object info files big.bin
```

---

## 📂 Code map

```
.
├── README.md
├── package.json                ← @nats-io/obj as dep
├── tsconfig.json
├── server.conf                 ← (unused)
└── src/
    ├── application.ts          ← Binds services.FileStorageService
    ├── index.ts                ← bootstrap (port 3203)
    ├── sequence.ts
    ├── services/
    │   └── file-storage.service.ts    ← Wraps @nats-io/obj Objm
    └── controllers/
        └── files.controller.ts        ← REST: GET/POST/DELETE /files/{name}
```

### Service pattern

```ts
import {Objm, type ObjectStore} from '@nats-io/obj';
import {NatsConnectorComponentBindings as N, type JetStreamClient} from 'loopback-nats-connector';

@injectable({scope: BindingScope.SINGLETON})
export class FileStorageService {
  private os?: ObjectStore;
  constructor(@inject(N.JETSTREAM) private js: JetStreamClient) {}

  private async getOs(): Promise<ObjectStore> {
    if (!this.os) {
      this.os = await new Objm(this.js as any).create('files');
    }
    return this.os;
  }
  // put/get/delete/list/info methods wrap os.put / os.get / etc.
}
```

Methods exposed:
- `put(name, data, description?)` → `ObjectInfo`
- `get(name)` → `Uint8Array | null`
- `delete(name)` → void
- `list()` → `ObjectInfo[]`
- `info(name)` → `ObjectInfo | null`

Files are streamed via `ReadableStream<Uint8Array>` (Web Streams API) under
the hood; large files are automatically chunked by `@nats-io/obj`.

---

## 🔗 Links
- [Background docs](../../../docs/natsbyexample/os-intro.md)
- [natsbyexample OS ↗](https://natsbyexample.com/examples/os/intro/python)
- [JetStream Object Store concepts ↗](https://docs.nats.io/nats-concepts/jetstream/obj_store)
