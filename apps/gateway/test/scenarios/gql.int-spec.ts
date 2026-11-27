import 'reflect-metadata';
import { runSecret } from '@zazzles/exchange-testing';
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
 * The GraphQL scenarios of the gateway: process-wide settings that are weak
 * on purpose (GQL-001 to GQL-004) and the deployment-level setting that is
 * the gateway's half of GQL-007. Each test asserts the exploit; the hardened
 * value of a setting is recorded beside its marker in the module factory.
 */
describe('the GraphQL scenarios', () => {
  let app: NestFastifyApplication;
  let subgraphs: Awaited<ReturnType<typeof standInSubgraphs>>;

  beforeAll(async () => {
    process.env.JWT_SECRET = runSecret();
    process.env.INTERNAL_SERVICE_TOKEN = runSecret();
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

  const post = async (payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'content-type': 'application/json', ...headers },
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });

  // GQL-001 — introspection, and the IDE, served to anyone.
  test('GQL-001: a caller with no token reads the whole graph from __schema', async () => {
    const response = await post({
      query: '{ __schema { queryType { name } types { name } } __typename }',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    const names: string[] = body.data.__schema.types.map(
      (type: { name: string }) => type.name,
    );
    // What was gained: the whole composed graph — every type of all three
    // services, its entities and its fields, with no credential at all.
    expect(names).toEqual(
      expect.arrayContaining(['User', 'Order', 'Market', 'Announcement']),
    );
  });

  test('GQL-001: a browser that opens the endpoint is served the GraphiQL IDE', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/graphql',
      headers: { accept: 'text/html' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    // What was gained: the IDE itself, ready to run queries against the graph.
    expect(response.body).toContain('<title>GraphiQL</title>');
  });
});
