import 'reflect-metadata';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { Http2Module } from '@zazzles/exchange-http2';
import { runSecret, sessionToken } from '@zazzles/exchange-testing';
import { Logger } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { Environment } from '../../src/config/environment.js';
import { registerEdge } from '../../src/edge/edge.js';
import { EdgeModule } from '../../src/edge/edge.module.js';
import { InternalModule } from '../../src/internal/internal.module.js';
import { MarketsModule } from '../../src/markets/markets.module.js';
import { PublicApiModule } from '../../src/public-api/public-api.module.js';
import { standInSubgraphs } from '../subgraphs.js';

/**
 * The edge scenarios: the open redirect, the reflected markup, the
 * cookie-authenticated preference change, and the error that is not masked.
 * One payload, sent to the vulnerable endpoint and to each counterpart.
 */
describe('the edge scenarios', () => {
  let app: NestFastifyApplication;
  let subgraphs: Awaited<ReturnType<typeof standInSubgraphs>>;
  let alice: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = runSecret();
    process.env.INTERNAL_SERVICE_TOKEN = runSecret();
    process.env.REDIRECT_ORIGINS = 'http://127.0.0.1:4021';
    alice = sessionToken(process.env.JWT_SECRET as string, {
      sub: 'u-alice',
      sid: 's-alice',
      role: 'USER',
    });
    subgraphs = await standInSubgraphs();
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await registerEdge(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await subgraphs.stopAll();
  });

  // REDIR-001 — the caller's next is the redirect target, wherever it points.
  test('REDIR-001: the redirect follows next off-site', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/redirect?next=http%3A%2F%2F127.0.0.1%3A4010%2Flanding',
      headers: { authorization: `Bearer ${alice}` },
    });

    expect(response.statusCode).toBe(302);
    // What was gained: the caller is carried off-site, to an origin no
    // operator listed, by a link this edge signed.
    expect(response.headers.location).toBe('http://127.0.0.1:4010/landing');
  });

  test('REDIR-001 counterpart 1: continue redirects to a fixed relative path', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/continue?next=http%3A%2F%2F127.0.0.1%3A4010%2Flanding',
      headers: { authorization: `Bearer ${alice}` },
    });

    expect(response.statusCode).toBe(302);
    // Refused by the fixed target: the same `next` is not read, and a
    // relative path cannot leave the edge.
    expect(response.headers.location).toBe('/api/v1/status');
  });

  test('REDIR-001 counterpart 2: continue-allowlisted does not follow an unlisted origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/continue-allowlisted?next=http%3A%2F%2F127.0.0.1%3A4010%2Flanding',
      headers: { authorization: `Bearer ${alice}` },
    });

    expect(response.statusCode).toBe(302);
    // Refused by the allowlist: the origin of `next` is not in
    // REDIRECT_ORIGINS, so the caller lands on the fixed path instead.
    expect(response.headers.location).toBe('/api/v1/status');
    expect(response.headers.location).not.toContain('4010');
  });

  // XSS-003 — the caller's name is written into the page as it arrived.
  const MARKER =
    '<img src=x onerror="window.__zazzles=\'zazzles-lab-marker\'">';

  test('XSS-003: the public status page serves the name unescaped, as text/html', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/public/status?name=${encodeURIComponent(MARKER)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    // What was gained: the marker is served as markup, in a page with no CSP —
    // a browser that opens the link runs the script the caller sent.
    expect(response.body).toContain(MARKER);
    expect(response.body).not.toContain('&lt;img');
  });

  test('XSS-003 counterpart 1: the default-scope status page escapes the same name', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/status?name=${encodeURIComponent(MARKER)}`,
    });

    expect(response.statusCode).toBe(200);
    // Refused by the template: the same name arrives as data, escaped, in a
    // page that also carries a CSP.
    expect(response.body).not.toContain(MARKER);
    expect(response.body).toContain('&lt;img src=x');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'self'",
    );
  });

  test('XSS-003 counterpart 2: status.json answers JSON with nosniff', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/status.json?name=${encodeURIComponent(MARKER)}`,
    });

    expect(response.statusCode).toBe(200);
    // Refused twice over: JSON is not a document to run markup in, and
    // `nosniff` keeps a browser from reading it as one.
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.json().caller).toBe(MARKER);
  });

  // COOKIE-003 — a state change a page on another site can submit.
  test('COOKIE-003: a form post with the session cookie changes the preference', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences',
      headers: {
        cookie: `vcx_session=${alice}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'theme=dark&language=fr',
    });

    expect(response.statusCode).toBe(200);
    const reached = subgraphs.accounts.reached.at(-1);
    // What was gained: the preference crossed to the profile and was written,
    // driven by nothing but a form a browser submits and the cookie it adds.
    expect(reached?.path).toBe('/internal/profile');
    expect(reached?.method).toBe('PUT');
    expect((reached?.body as { theme?: string })?.theme).toBe('dark');
    expect(reached?.headers.cookie).toBe(`vcx_session=${alice}`);
  });

  test('COOKIE-003 counterpart 1: preferences/json wants a bearer header and a JSON body', async () => {
    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences/json',
      headers: {
        cookie: `vcx_session=${alice}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'theme=dark',
    });
    // Refused by what a cross-site form cannot send: no bearer header to
    // carry, so the cookie alone is not taken for the caller.
    expect(unauthenticated.statusCode).toBe(401);

    const form = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences/json',
      headers: {
        authorization: `Bearer ${alice}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'theme=dark',
    });
    // And the body a form does send is not the JSON the route carries.
    expect(form.statusCode).toBe(415);
  });

  test('COOKIE-003 counterpart 2: preferences/csrf refuses the same post without its token', async () => {
    const carried = subgraphs.accounts.reached.length;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences/csrf',
      headers: {
        cookie: `vcx_session=${alice}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'theme=dark',
    });

    // Refused by the CSRF check: a cookie alone is a request a page on
    // another site can arrange; the token it cannot also add is missing, and
    // nothing is carried to the profile.
    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('csrf');
    expect(subgraphs.accounts.reached.length).toBe(carried);
  });
});

// INFO-002 — the same failure, answered three ways: returned in full by the
// public diagnostics page, masked by the markets ticker, logged and given a
// request id by the partner ticker. Trading is gone, which is the failure.
describe('the INFO-002 diagnostics, with trading gone', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = runSecret();
    process.env.INTERNAL_SERVICE_TOKEN = runSecret();
    process.env.PARTNER_ORIGINS = 'http://127.0.0.1:4021';
    process.env.REDIRECT_ORIGINS = 'http://127.0.0.1:4021';
    // Nobody listens on port 1: the closest a test gets to a service that is not running.
    process.env.TRADING_PORT = '1';
    app = (
      await Test.createTestingModule({
        imports: [
          EnvironmentModule.forRoot(Environment),
          AuthModule,
          Http2Module,
          InternalModule,
          EdgeModule,
          MarketsModule,
          PublicApiModule,
        ],
      }).compile()
    ).createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await registerEdge(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test('INFO-002: the public diagnostics returns the failure itself, message and stack', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/public/diagnostics',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    // What was gained: why trading failed and the stack of the call that
    // failed, in the answer, for anyone who asks and with no credential.
    expect(String(body.error)).toContain('trading is unreachable');
    expect(String(body.stack)).toContain('trading is unreachable');
    expect(String(body.stack)).toContain(' at ');
  });

  test('INFO-002 counterpart 1: the markets ticker answers one masked sentence', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/markets/ticker',
    });

    expect(response.statusCode).toBe(503);
    // Refused by the mask: the same failure is one sentence about the
    // ticker, with neither the reason nor any stack in the answer.
    expect(response.json().message).toBe('the ticker is unavailable');
    expect(response.body).not.toContain('unreachable');
    expect(response.body).not.toContain('stack');
  });

  test('INFO-002 counterpart 2: the partner ticker answers a request id, and the stack goes to the log', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/ticker',
    });
    const calls = logged.mock.calls;
    logged.mockRestore();

    expect(response.statusCode).toBe(503);
    const body = response.json();
    // Refused by the handler: the same failure is one sentence and a request
    // id to quote; the stack was written to the server's log, not the answer.
    expect(body.error).toBe('the ticker is unavailable');
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.body).not.toContain('unreachable');
    expect(response.body).not.toContain('stack');
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0]?.[0])).toContain(' at ');
  });
});
