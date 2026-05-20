/**
 * Unit tests for `NatsConnectorComponent` + `normalizeOptions`.
 *
 * Real deps exercised:
 *   - LB4 `Application.bind(...)` / `Context.getSync(...)` round-trip.
 *   - `normalizeOptions(...)` flat → canonical desugar.
 *
 * Mock surface: none. Component does not call `nats.connect()` —
 * verified by absence of any nats.js stub in this test.
 *
 * Out of scope: actual lifecycle execution (ConnectionObserver) →
 * `connection-observer.unit.ts` + integration tests.
 */
import {expect} from '@loopback/testlab';
import {Application, ContextTags} from '@loopback/core';
import {NatsConnectorComponent, normalizeOptions} from '../../component';
import {ConnectionObserver} from '../../observers/connection.observer';
import {NatsConnectorComponentBindings} from '../../keys';
import {NatsConnectionRegistry} from '../../services/connection-registry.service';

describe('NatsConnectorComponent', () => {
  describe('normalizeOptions', () => {
    it('passes canonical options through unchanged', () => {
      const input = {
        connections: {
          internal: {servers: ['nats://x:4222']},
          ingress: {servers: ['nats://y:4222']},
        },
        default: 'internal',
      };
      const out = normalizeOptions(input);
      expect(out).to.deepEqual(input);
    });

    it('desugars flat shorthand into {connections: {default: <flat>}}', () => {
      const input = {servers: ['nats://localhost:4222'], auth: {token: 'tk'}};
      const out = normalizeOptions(input);
      expect(out).to.deepEqual({
        connections: {default: input},
      });
    });

    it('treats canonical-with-servers-key as canonical (no flat-detect false positive)', () => {
      // hypothetical pathological case: connections AND servers at top level.
      // Spec: presence of `connections` key means canonical.
      const input = {
        connections: {default: {servers: ['nats://x:4222']}},
        // tslint:disable-next-line: no-any
        servers: ['nats://wrong:4222'],
      } as unknown as Parameters<typeof normalizeOptions>[0];
      const out = normalizeOptions(input);
      expect(out.connections.default.servers).to.deepEqual(['nats://x:4222']);
    });

    it('normalizeOptions accepts empty connections (registry-only mode)', () => {
      // Empty static connections is valid for dynamic / multi-tenant apps that
      // register all connections via NatsConnectionRegistry.add() at runtime.
      const out = normalizeOptions({connections: {}} as unknown as Parameters<
        typeof normalizeOptions
      >[0]);
      expect(out.connections).to.deepEqual({});
    });
  });

  describe('component registration', () => {
    function makeApp(opts: Parameters<typeof normalizeOptions>[0]) {
      const app = new Application();
      app.configure(NatsConnectorComponentBindings.COMPONENT).to(opts);
      app.component(NatsConnectorComponent);
      return app;
    }

    it('binds NORMALIZED_OPTIONS after construction (flat shorthand)', async () => {
      const app = makeApp({servers: ['nats://localhost:4222']});
      const opts = await app.get(
        NatsConnectorComponentBindings.NORMALIZED_OPTIONS,
      );
      expect(opts).to.deepEqual({
        connections: {default: {servers: ['nats://localhost:4222']}},
      });
    });

    it('binds NORMALIZED_OPTIONS after construction (canonical)', async () => {
      const app = makeApp({
        connections: {a: {servers: ['nats://x:4222']}},
        default: 'a',
      });
      const opts = await app.get(
        NatsConnectorComponentBindings.NORMALIZED_OPTIONS,
      );
      expect(opts).to.deepEqual({
        connections: {a: {servers: ['nats://x:4222']}},
        default: 'a',
      });
    });

    it('registers ConnectionObserver as a lifeCycleObserver', async () => {
      const app = makeApp({servers: ['nats://localhost:4222']});
      const componentBinding = app.getBinding(
        NatsConnectorComponentBindings.COMPONENT,
      );
      const component = await app.get<NatsConnectorComponent>(
        componentBinding.key,
      );
      expect(component.lifeCycleObservers).to.containEql(ConnectionObserver);
    });

    it('NatsConnectionRegistry is registered as a lifeCycleObserver', async () => {
      const app = makeApp({servers: ['nats://localhost:4222']});
      const componentBinding = app.getBinding(
        NatsConnectorComponentBindings.COMPONENT,
      );
      const component = await app.get<{lifeCycleObservers: unknown[]}>(
        componentBinding.key,
      );
      expect(component.lifeCycleObservers).to.containDeep([
        NatsConnectionRegistry,
      ]);
    });

    it('does NOT call nats.connect during construction', async () => {
      // Indirect: instantiating the component must not throw a connect error.
      // ConnectionObserver opens connections in its start() lifecycle hook,
      // which is not invoked unless app.start() runs.
      const app = makeApp({servers: ['nats://nonexistent:9999']});
      const component = await app.get<NatsConnectorComponent>(
        NatsConnectorComponentBindings.COMPONENT,
      );
      // If we reach this point with no thrown error, the assertion holds.
      expect(component).to.be.instanceOf(NatsConnectorComponent);
    });

    it('component COMPONENT key is tagged via ContextTags.KEY', () => {
      const app = makeApp({servers: ['nats://localhost:4222']});
      const binding = app.getBinding(NatsConnectorComponentBindings.COMPONENT);
      const tagged = binding.tagMap[ContextTags.KEY];
      const taggedKey = typeof tagged === 'string' ? tagged : tagged.key;
      expect(taggedKey).to.equal(NatsConnectorComponentBindings.COMPONENT.key);
    });
  });
});
