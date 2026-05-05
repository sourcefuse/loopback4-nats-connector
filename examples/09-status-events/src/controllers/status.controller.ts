import {inject} from '@loopback/core';
import type {EventEmitter} from 'events';
import {NatsConnectorComponentBindings as N} from 'loopback-nats-connector';

/**
 * Subscribes to the per-connection status EventEmitter exposed at
 * `N.EVENTS` and logs every event it receives so users can observe live
 * connection status changes (disconnect, reconnect, etc.) in stdout.
 */
export class StatusController {
  constructor(@inject(N.EVENTS) private readonly events: EventEmitter) {
    const log = (type: string) => (data: unknown) => {
      console.log(`[StatusController] ${type}`, data ?? '');
    };

    this.events.on('disconnect', log('disconnect'));
    this.events.on('reconnect', log('reconnect'));
    this.events.on('reconnecting', log('reconnecting'));
    this.events.on('error', log('error'));
    this.events.on('staleConnection', log('staleConnection'));
    this.events.on('pingTimer', log('pingTimer'));
    this.events.on('update', log('update'));
    this.events.on('ldm', log('ldm'));
    this.events.on('slowConsumer', log('slowConsumer'));
  }
}
