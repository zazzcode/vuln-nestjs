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
import { OpenapiService } from '../../src/openapi/openapi.service.js';
import { standInSubgraphs } from '../subgraphs.js';

/**
 * The security-misconfiguration scenarios of the gateway's public scope and
 * open pages: one payload, sent to the vulnerable endpoint and to each
 * protected counterpart.
 */
describe('the configuration scenarios', () => {
  let app: NestFastifyApplication;
  let subgraphs: Awaited<ReturnType<typeof standInSubgraphs>>;
  let admin: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = runSecret();
    process.env.INTERNAL_SERVICE_TOKEN = runSecret();
    process.env.PARTNER_ORIGINS = 'http://127.0.0.1:4021';
    admin = sessionToken(process.env.JWT_SECRET as string, {
      sub: 'u-admin',
      sid: 's-admin',
      role: 'ADMIN',
    });
    subgraphs = await standInSubgraphs();
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await registerEdge(app);
    await app.init();
    app.get(OpenapiService).buildFor(app);
  });

  afterAll(async () => {
    await app.close();
    await subgraphs.stopAll();
  });

  // CONFIG-001 — the public scope echoes any origin, with credentials.
  test('CONFIG-001: the public ticker echoes an origin nobody listed, with credentials', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/public/ticker',
      headers: { origin: 'http://127.0.0.1:4020' },
    });

    expect(response.statusCode).toBe(200);
    // What was gained: any site's origin is echoed with credentials allowed,
    // so a signed-in browser lets that site read this scope's answers.
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:4020',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('CONFIG-001: a preflight for the same origin is answered for any header the site asks', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/public/ticker',
      headers: {
        origin: 'http://127.0.0.1:4020',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:4020',
    );
    expect(response.headers['access-control-allow-headers']).toBe(
      'authorization',
    );
  });

  // The identical request to the two protected counterparts.
  test('CONFIG-001 counterpart 1: the markets ticker answers no CORS header at all', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/markets/ticker',
      headers: { origin: 'http://127.0.0.1:4020' },
    });

    expect(response.statusCode).toBe(200);
    // Refused by the absence of the mechanism: with no CORS answer, a browser
    // refuses the cross-origin read whatever the page does.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });

  test('CONFIG-001 counterpart 2: the partner ticker echoes only an origin the operator listed', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/ticker',
      headers: { origin: 'http://127.0.0.1:4020' },
    });

    expect(response.statusCode).toBe(200);
    // Refused by the allowlist: this origin is not in PARTNER_ORIGINS, so
    // nothing about it is echoed.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });

  // CONFIG-002 — the public scope serves its pages with no security headers.
  test('CONFIG-002: the public status page carries no CSP, no nosniff, no frame options', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/public/status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    // What was gained: the page reaches a browser with nothing that constrains
    // what may be done with it — no CSP, no MIME pinning, no frame policy.
    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBeUndefined();
    expect(response.headers['x-frame-options']).toBeUndefined();
  });

  test('CONFIG-002 counterpart 1: health answers with helmet on', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  test('CONFIG-002 counterpart 2: the status page sets the same headers by hand', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'self'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  // CONFIG-003 — the API document, served with no authentication.
  test('CONFIG-003: the API pages answer with no token at all', async () => {
    const index = await app.inject({ method: 'GET', url: '/docs' });
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.body).toContain('href="/docs/json"');

    const document = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(document.statusCode).toBe(200);
    const paths = Object.keys(document.json().paths);
    // What was gained: the whole API surface — every route the edge carries,
    // its methods and its schemas — read with no credential at all.
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/health',
        '/api/v1/auth/sign-in',
        '/api/v1/admin/users',
      ]),
    );
  });

  test('CONFIG-003 counterpart 1: the administrator document refuses a caller without the role', async () => {
    const refused = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/openapi.json',
    });
    // Refused by the guard: the document is an administrator's, and this is nobody.
    expect(refused.statusCode).toBe(401);

    const answered = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/openapi.json',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(answered.statusCode).toBe(200);
    expect(Object.keys(answered.json().paths)).toContain('/api/v1/health');
  });

  test('CONFIG-003 counterpart 2: the service-token document refuses a caller without the token', async () => {
    const refused = await app.inject({
      method: 'GET',
      url: '/api/v1/openapi.json',
    });
    // Refused by the guard: only the system's own call reads this copy.
    expect(refused.statusCode).toBe(401);

    const answered = await app.inject({
      method: 'GET',
      url: '/api/v1/openapi.json',
      headers: {
        'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN as string,
      },
    });
    expect(answered.statusCode).toBe(200);
  });

  // CONFIG-004 — a debug endpoint answers the environment and the versions.
  test('CONFIG-004: the debug page answers environment values and dependency versions to anyone', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/debug' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // What was gained: the run's own secret — the value of JWT_SECRET — plus
    // every other variable of the process, and the exact dependency versions
    // it runs on: enough to look for a known weakness in a known version.
    expect(body.environment.JWT_SECRET).toBe(process.env.JWT_SECRET);
    expect(body.environment.INTERNAL_SERVICE_TOKEN).toBe(
      process.env.INTERNAL_SERVICE_TOKEN,
    );
    expect(body.dependencies['@apollo/gateway']).toMatch(/^\d+/);
    expect(body.versions.node).toBeDefined();
  });

  test('CONFIG-004 counterpart 1: health answers a status and nothing else', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    const text = response.body;
    // Refused by the shape of the answer: a status page has no place for the
    // environment or a version to appear.
    expect(text).not.toContain(process.env.JWT_SECRET as string);
    expect(JSON.parse(text).versions).toBeUndefined();
  });

  test('CONFIG-004 counterpart 2: the admin diagnostics page answers allowlisted keys only', async () => {
    const refused = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/diagnostics',
    });
    // Refused by the guard: the page is an administrator's.
    expect(refused.statusCode).toBe(401);

    const answered = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/diagnostics',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(answered.statusCode).toBe(200);
    const body = answered.json();
    // Refused by the allowlist: a key not on it is never read, so its value
    // cannot leave the process.
    expect(Object.keys(body.environment)).not.toContain('JWT_SECRET');
    expect(JSON.stringify(body)).not.toContain(
      process.env.JWT_SECRET as string,
    );
  });
});
