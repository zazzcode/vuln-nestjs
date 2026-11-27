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
 * The GraphQL scenarios of the gateway: process-wide settings that are weak
 * on purpose (GQL-001 to GQL-004) and the deployment-level setting that is
 * the gateway's half of GQL-007. Each test asserts the exploit; the hardened
 * value of a setting is recorded beside its marker in the module factory.
 */
describe('the GraphQL scenarios', () => {
  let app: NestFastifyApplication;
  let subgraphs: Awaited<ReturnType<typeof standInSubgraphs>>;
  let alice: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = runSecret();
    process.env.INTERNAL_SERVICE_TOKEN = runSecret();
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

  // GQL-002 — no depth or complexity limit. The document is nested twelve
  // deep: every user of the seed has two orders, so deeper walks fan out
  // exponentially and twelve already proves no limit stands in the way (the
  // hardened value is five).
  test('GQL-002: a query nested far past any limit is accepted and answered with data', async () => {
    const depth = 12;
    let source = 'me { displayName ';
    for (let level = 0; level < depth; level++) {
      source += 'orders { id user { id ';
    }
    source += '}'.repeat(depth * 2) + ' }';
    source = `query { ${source} }`;

    const response = await post(
      { query: source },
      {
        authorization: `Bearer ${alice}`,
      },
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toBeUndefined();
    // What was gained: the graph plans and runs a query of unbounded depth —
    // one request is a walk of every order of the caller, twelve levels deep.
    let level: unknown = body.data.me;
    for (let walked = 0; walked < depth; walked++) {
      level = (
        (level as { orders?: unknown[] }).orders?.[0] as {
          user?: unknown;
        }
      ).user;
      expect(level).toMatchObject({ id: 'u-alice' });
    }
  });
});
