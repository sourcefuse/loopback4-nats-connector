import {inject} from '@loopback/core';
import {get, param, post, requestBody} from '@loopback/rest';
import {
  NatsConnectorComponentBindings as N,
  NatsPublisher,
  reply,
  subscribe,
} from 'loopback-nats-connector';

interface GreetReq {
  name: string;
}
interface GreetRes {
  greeting: string;
  ts: number;
}

/**
 * Authentication & Authorization category — comprehensive coverage.
 *
 * Modes (set AUTH_MODE env, run matching server config):
 *   token        → server-token.conf
 *   userpass     → server-userpass.conf  (also works with permissions, sys-account, accounts)
 *   tls          → server-tls.conf       (mTLS — uses tls/client-cert.pem)
 *   nkey         → server with nkey users (set NATS_NKEY_SEED)
 *   jwt          → decentralised auth (set NATS_JWT + NATS_NKEY_SEED)
 *
 * Server configs included:
 *   - server-token.conf            Token auth
 *   - server-userpass.conf         Plain user/password
 *   - server-tls.conf              TLS + mTLS (client cert required)
 *   - server-permissions.conf      pub/sub permissions per user
 *   - server-private-inbox.conf    Private inbox + allow_responses
 *   - server-accounts.conf         Multi-tenancy with exports/imports
 *   - server-sys-account.conf      $SYS account for monitoring
 *   - server-callout.conf          Auth callout (centralized) — paired with bin/callout-service.ts
 *
 * Sources covered:
 *   https://natsbyexample.com/examples/auth/* (all 6)
 *   https://docs.nats.io/running-a-nats-service/configuration/securing_nats/* (all submodes)
 */
export class AuthController {
  constructor(@inject(N.PUBLISHER) private pub: NatsPublisher) {}

  // For Permissions test — only writable by 'publisher' user
  @subscribe('events.>')
  async onEvent(payload: unknown): Promise<void> {
    console.log('[auth] events.>:', JSON.stringify(payload));
  }

  // For Permissions test — only writable by 'publisher' user
  @subscribe('audit.>')
  async onAudit(payload: unknown): Promise<void> {
    console.log('[auth] audit.>:', JSON.stringify(payload));
  }

  // Private Inbox — service responder; needs allow_responses on this user
  @reply('services.greet')
  async greet(req: GreetReq): Promise<GreetRes> {
    console.log(`[auth] @reply services.greet name=${req.name}`);
    return {greeting: `Hello, ${req.name}!`, ts: Date.now()};
  }

  // Multi-tenancy — subscribe to imported subject from another account
  @subscribe('weather.events.>')
  async onWeather(payload: unknown): Promise<void> {
    console.log(
      '[auth] weather.events.> (imported stream):',
      JSON.stringify(payload),
    );
  }

  @get('/whoami')
  async whoami(): Promise<{authMode: string; ok: true}> {
    return {authMode: process.env.AUTH_MODE ?? 'token', ok: true};
  }

  @post('/secure-publish')
  async publish(
    @requestBody() body: {subject: string; payload: unknown},
  ): Promise<{published: true}> {
    await this.pub.publish(body.subject, body.payload);
    console.log(`[auth] published ${body.subject}`);
    return {published: true};
  }

  // Issue NATS request to a service (used for private-inbox demo)
  @get('/greet/{name}')
  async callGreet(@param.path.string('name') name: string): Promise<unknown> {
    return this.pub.request<GreetReq, GreetRes>('services.greet', {name});
  }
}
