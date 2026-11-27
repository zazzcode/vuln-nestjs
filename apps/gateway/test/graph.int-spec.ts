import { runSecret, sessionToken } from '@zazzles/exchange-testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { standInSubgraphs } from './subgraphs.js';

/**
 * The graph as a whole: the gateway composing the three stand-ins at start and
 * answering a query whose fields come from all three. This is the round trip
 * the specification's AC1 names: the transports the services speak, the
 * headers that cross, and the token the gateway presents on every fetch.
 */
describe('the federated graph over three stand-ins', () => {
  let app: NestFastifyApplication;
  let subgraphs: Awaited<ReturnType<typeof standInSubgraphs>>;
  let alice: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = runSecret();
    process.env.INTERNAL_SERVICE_TOKEN = runSecret();
    alice = sessionToken(process.env.JWT_SECRET, {
      sub: 'u-alice',
      sid: 's-alice',
      role: 'USER',
    });
    subgraphs = await standInSubgraphs();
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await subgraphs.stopAll();
  });

  const query = async (source: string, headers: Record<string, string> = {}) =>
    (
      await app.inject({
        method: 'POST',
        url: '/graphql',
        headers: { 'content-type': 'application/json', ...headers },
        payload: JSON.stringify({ query: source }),
      })
    ).json();

  test('answers a query whose fields come from all three services', async () => {
    const answer = await query(
      '{ orders { id symbol user { id email } } announcements { id title } }',
      { authorization: `Bearer ${alice}`, 'x-request-id': 'zazzles-lab-marker' },
    );

    expect(answer.errors).toBeUndefined();
    expect(answer.data.orders).toHaveLength(2);
    expect(answer.data.orders.map((order: { id: string }) => order.id)).toEqual(
      ['1', '6'],
    );
    for (const order of answer.data.orders) {
      expect(order.user).toEqual({
        id: 'u-alice',
        email: 'alice@vcx.exchange',
      });
    }
    expect(answer.data.announcements).toEqual([
      { id: '1', title: 'Welcome to VCX' },
    ]);
  });

  test('reached accounts and trading over HTTP/2 and notifications over HTTP/1.1', () => {
    expect(
      subgraphs.accounts.reached.map((reached) => reached.protocol),
    ).toEqual(expect.arrayContaining(['2.0']));
    expect(
      subgraphs.trading.reached.map((reached) => reached.protocol),
    ).toEqual(expect.arrayContaining(['2.0']));
    expect(
      subgraphs.notifications.reached.every(
        (reached) => reached.protocol === '1.1',
      ),
    ).toBe(true);
  });

  test('forwarded the authorization header to the service that owns the field, and nothing else of the caller', () => {
    const seen = subgraphs.trading.reached.find(
      (reached) =>
        typeof (reached.body as { query?: string })?.query === 'string' &&
        (reached.body as { query: string }).query.includes('orders'),
    );
    expect(seen?.headers.authorization).toBe(`Bearer ${alice}`);
    // A header the caller sent that is not in the forwarded list does not cross.
    expect(seen?.headers['x-request-id']).toBeUndefined();
  });

  test('presented the internal service token on every subgraph fetch, composition included', () => {
    for (const standIn of [
      subgraphs.accounts,
      subgraphs.trading,
      subgraphs.notifications,
    ]) {
      expect(standIn.reached.length).toBeGreaterThan(0);
      for (const reached of standIn.reached) {
        expect(reached.headers['x-internal-token']).toBe(
          process.env.INTERNAL_SERVICE_TOKEN,
        );
      }
    }
  });

  test('reports a query for a caller it cannot identify without claiming one', async () => {
    const answer = await query('{ orders { id } announcements { id } }');

    expect(answer.errors).toBeUndefined();
    expect(answer.data.orders).toEqual([]);
    expect(answer.data.announcements).toEqual([{ id: '1' }]);
  });

  test('answers health with every stand-in and its store, through the real internal client', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      services: {
        accounts: {
          status: 'ok',
          service: 'accounts',
          store: { engine: 'a store', connected: true },
        },
        trading: {
          status: 'ok',
          service: 'trading',
          store: { engine: 'a store', connected: true },
        },
        notifications: {
          status: 'ok',
          service: 'notifications',
          store: { engine: 'a store', connected: true },
        },
      },
    });
  });
});
