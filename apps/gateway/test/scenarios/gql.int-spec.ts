import 'reflect-metadata';
import { SERVICE_TOKEN_HEADER } from '@zazzles/exchange-internal-auth';
import { Http2ClientService } from '@zazzles/exchange-http2';
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
      const order = (level as { orders?: { user?: unknown }[] }).orders?.[0];
      level = order?.user;
      expect(level).toMatchObject({ id: 'u-alice' });
    }
  });

  // GQL-003 — batched requests: one HTTP request carries many operations.
  test('GQL-003: one request carrying three operations is answered as three', async () => {
    const response = await post(
      [
        { query: '{ __typename }' },
        { query: 'query { markets { symbol } }' },
        { query: '{ announcements { id title } }' },
      ],
      { authorization: `Bearer ${alice}` },
    );

    expect(response.statusCode).toBe(200);
    const bodies = response.json();
    // What was gained: an array of operations in one call, each answered —
    // the shape a brute force uses to fit many guesses in one request.
    expect(Array.isArray(bodies)).toBe(true);
    expect(bodies).toHaveLength(3);
    expect(bodies[0].data.__typename).toBe('Query');
    expect(bodies[1].data.markets).toHaveLength(5);
    expect(bodies[2].data.announcements).toEqual([
      { id: '1', title: 'Welcome to VCX' },
    ]);
  });

  // GQL-004 — a stack trace in every error.
  test("GQL-004: a validation error answers the server's stack in extensions.stacktrace", async () => {
    const response = await post(
      { query: '{ me { nope } }' },
      { authorization: `Bearer ${alice}` },
    );

    // Apollo answers a validation failure with 400; the answer carries the
    // stack all the same, which is what the scenario is about.
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.errors).toHaveLength(1);
    const error = body.errors[0];
    expect(error.message).toContain('nope');
    // What was gained: the server's own stack, frames and file paths of the
    // process included, returned to whoever sent the bad query.
    expect(Array.isArray(error.extensions?.stacktrace)).toBe(true);
    const stack = error.extensions.stacktrace as string[];
    expect(stack.length).toBeGreaterThan(3);
    expect(stack.join('\n')).toMatch(/\sat\s/);
  });

  // GQL-007 — the backend federation queries answer any caller. The gateway's
  // half is built: it presents `x-internal-token` on every subgraph fetch. The
  // subgraph's half is played by the stand-in's `requireInternalToken` switch:
  // off, it is the services as they are today; on, it is the hardened value.
  const ENTITIES_QUERY = `query($reps: [_Any!]!) {
    _entities(representations: $reps) {
      ... on User { id email }
    }
  }`;

  const entitiesTo = (port: number, token?: string) =>
    app
      .get(Http2ClientService)
      .fetch(`http://127.0.0.1:${port}/graphql`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { [SERVICE_TOKEN_HEADER]: token } : {}),
        },
        body: JSON.stringify({
          query: ENTITIES_QUERY,
          variables: { reps: [{ __typename: 'User', id: 'u-admin' }] },
        }),
      })
      .then(async (response) => ({
        status: response.status,
        body: (await response.json()) as {
          data?: { _entities?: unknown[] };
          errors?: { message: string }[];
        },
      }));

  const userById = (port: number, token?: string) =>
    app
      .get(Http2ClientService)
      .fetch(`http://127.0.0.1:${port}/graphql`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: 'query { user(id: "u-admin") { id } }',
        }),
      })
      .then(async (response) => ({
        status: response.status,
        body: (await response.json()) as {
          data?: unknown;
          errors?: { message: string }[];
        },
      }));

  test('GQL-007: a direct _entities call with no token reads any user by key', async () => {
    // As the services are today: the federation queries require no credential.
    subgraphs.accounts.requireInternalToken = false;

    const read = await entitiesTo(subgraphs.accounts.port);

    expect(read.status).toBe(200);
    // What was gained: the administrator's own record, by key, with no
    // credential at all — through the query the gateway alone is meant to use.
    expect(read.body.data?._entities).toEqual([
      { id: 'u-admin', email: 'admin@vcx.exchange' },
    ]);

    // The same service refuses the same record to the guarded field: `user(id)`
    // is an administrator's question, and this caller is nobody.
    const guarded = await userById(subgraphs.accounts.port);
    expect(guarded.body.errors?.[0]?.message).toBe(
      'user(id) is for an administrator',
    );
  });

  test('GQL-007: with the token required, a direct call is refused and the graph still answers', async () => {
    // The hardened value: a subgraph answers `_entities` and `_service` to the
    // gateway only, on presentation of the internal token.
    subgraphs.accounts.requireInternalToken = true;

    const refused = await entitiesTo(subgraphs.accounts.port);
    expect(refused.status).toBe(403);
    expect(refused.body.data).toBeUndefined();

    // The gateway presents the token, so the graph it composes still answers —
    // including the join that is itself an `_entities` call to accounts.
    const throughTheGraph = await post(
      { query: '{ orders { id user { id email } } }' },
      { authorization: `Bearer ${alice}` },
    );
    expect(throughTheGraph.statusCode).toBe(200);
    const body = throughTheGraph.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.orders).toHaveLength(2);
    for (const order of body.data.orders) {
      expect(order.user).toEqual({
        id: 'u-alice',
        email: 'alice@vcx.exchange',
      });
    }

    // And a direct call that does present the token is the gateway's own.
    const asTheGateway = await entitiesTo(
      subgraphs.accounts.port,
      process.env.INTERNAL_SERVICE_TOKEN,
    );
    expect(asTheGateway.status).toBe(200);
    expect(asTheGateway.body.data?._entities).toEqual([
      { id: 'u-admin', email: 'admin@vcx.exchange' },
    ]);

    subgraphs.accounts.requireInternalToken = false;
  });
});
