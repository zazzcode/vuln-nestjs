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
});
