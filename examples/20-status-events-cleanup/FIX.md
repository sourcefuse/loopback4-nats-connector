# C1 + M1 Fix — addAbortListener + AbortController

```typescript
import {addAbortListener} from 'events'; // Node 20.5+

export function wireStatusEvents(
  conn: NatsConnection,
  emitter: EventEmitter,
  signal: AbortSignal,   // <- NEW parameter
): void {
  emitter.on('error', () => {});

  // M1 fix: auto-remove all listeners when connection stops
  addAbortListener(signal, () => emitter.removeAllListeners());

  void (async () => {
    try {
      for await (const status of conn.status() as AsyncIterable<Status>) {
        if (signal.aborted) break; // <- C1 fix: exits cleanly
        emitter.emit(status.type, data);
      }
    } catch (err) {
      if (!signal.aborted) emitter.emit('error', err);
    }
  })();
}
```

`ConnectionObserver.stop()`:
```typescript
async stop() {
  this.controller.abort();    // <- signals all status iterators + removes listeners
  await Promise.all(drains);  // then drain connections
  this.controller = new AbortController(); // reset for restart
}
```
