import 'reflect-metadata';
import { runSecret, sessionToken } from '@zazzles/exchange-testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { registerEdge } from '../../src/edge/edge.js';
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
});
