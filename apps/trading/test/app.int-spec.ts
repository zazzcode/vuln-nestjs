import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import {
  errorCode,
  graphql,
  request,
  runSecret,
  sessionToken,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../src/app.module.js';

// The service is started with the adapter it uses, on its own port, with a store it starts itself.
// The first start on a machine downloads MySQL first.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startService({
    module: AppModule,
    adapter: () => new FastifyAdapter({ http2: true }),
    port: 3102,
  });
}, 300_000);

// Stops the service, and fails when a mysqld process or a temporary directory it created remains.
afterAll(async () => {
  await service?.stop();
});

const tokenOf = (sub: string, role: 'ADMIN' | 'USER' = 'USER'): string =>
  sessionToken(JWT_SECRET, { sub, sid: `s-${sub}`, role });
const query = (
  source: string,
  options: {
    token?: string;
    variables?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
) => graphql(`${service.url}/graphql`, source, options);

// The gateway resolves entities by key, presenting the service token on the call: this subgraph answers its
// federation queries to that token and to nobody else. A test that sends `_entities` plays the gateway, and presents it too.
const AS_THE_GATEWAY = { 'x-internal-token': SERVICE_TOKEN };
const ENTITIES =
  'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on Order { id userId symbol } ... on User { id orders { id userId } } } }';
const entities = (token: string, representations: Record<string, unknown>[]) =>
  query(ENTITIES, {
    token,
    variables: { representations },
    headers: AS_THE_GATEWAY,
  });

describe('the trading service, started alone', () => {
  test('says it is up, with its store connected', async () => {
    const response = await request(`${service.url}/internal/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'trading',
      store: { engine: 'mysql', connected: true },
    });
  });

  test('speaks HTTP/2 cleartext on its listener, and nothing else', async () => {
    await expect(fetch(`${service.url}/internal/health`)).rejects.toThrow();

    expect((await request(`${service.url}/internal/health`)).status).toBe(200);
    expect(service.receivedHttpVersions().at(-1)).toBe('2.0');
  });

  test('refuses a caller that has no token', async () => {
    expect(errorCode(await query('{ orders { id } }'))).toBe('UNAUTHENTICATED');
  });

  test("answers a caller with the caller's own orders, money as decimal strings, and the order's user as a reference", async () => {
    expect(
      await query(
        '{ orders { id userId symbol side type limitPrice quantity memo status user { id } } }',
        { token: tokenOf('u-alice') },
      ),
    ).toEqual({
      data: {
        orders: [
          {
            id: '1',
            userId: 'u-alice',
            symbol: 'BTC-USD',
            side: 'BUY',
            type: 'LIMIT',
            limitPrice: '64000.00',
            quantity: '0.50000000',
            memo: '=zazzles-lab-marker',
            status: 'OPEN',
            user: { id: 'u-alice' },
          },
          {
            id: '6',
            userId: 'u-alice',
            symbol: 'SOL-USD',
            side: 'SELL',
            type: 'LIMIT',
            limitPrice: '160.00',
            quantity: '5.00000000',
            memo: null,
            status: 'OPEN',
            user: { id: 'u-alice' },
          },
        ],
      },
    });
    expect(
      (await query('{ orders { id userId } }', { token: tokenOf('u-bob') }))
        .data,
    ).toEqual({
      orders: [
        { id: '2', userId: 'u-bob' },
        { id: '7', userId: 'u-bob' },
      ],
    });
  });

  // The gateway resolves an entity by key. Neither this resolver nor any field resolver is
  // behind the global guard, so each checks the caller for itself.
  test('resolves an order by key for who placed it and for an administrator, and for nobody else', async () => {
    const order = (id: string) => [{ __typename: 'Order', id }];

    expect(
      errorCode(
        await query(ENTITIES, {
          variables: { representations: order('1') },
          headers: AS_THE_GATEWAY,
        }),
      ),
    ).toBe('UNAUTHENTICATED');
    expect((await entities(tokenOf('u-alice'), order('1'))).data).toEqual({
      _entities: [{ id: '1', userId: 'u-alice', symbol: 'BTC-USD' }],
    });
    expect(errorCode(await entities(tokenOf('u-alice'), order('2')))).toBe(
      'FORBIDDEN',
    );
    expect(
      (await entities(tokenOf('u-admin', 'ADMIN'), order('2'))).data,
    ).toEqual({
      _entities: [{ id: '2', userId: 'u-bob', symbol: 'BTC-USD' }],
    });
    expect(errorCode(await entities(tokenOf('u-alice'), order('99')))).toBe(
      'NOT_FOUND',
    );
  });

  // This service's part of the user entity: the reference names a user the caller did not choose.
  test("adds a user's orders to the user entity, for that user and for an administrator, and for nobody else", async () => {
    const user = (id: string) => [{ __typename: 'User', id }];

    expect(
      errorCode(
        await query(ENTITIES, {
          variables: { representations: user('u-alice') },
          headers: AS_THE_GATEWAY,
        }),
      ),
    ).toBe('UNAUTHENTICATED');
    expect((await entities(tokenOf('u-alice'), user('u-alice'))).data).toEqual({
      _entities: [
        {
          id: 'u-alice',
          orders: [
            { id: '1', userId: 'u-alice' },
            { id: '6', userId: 'u-alice' },
          ],
        },
      ],
    });
    expect(errorCode(await entities(tokenOf('u-alice'), user('u-bob')))).toBe(
      'FORBIDDEN',
    );
    expect(
      (await entities(tokenOf('u-admin', 'ADMIN'), user('u-bob'))).data,
    ).toEqual({
      _entities: [
        {
          id: 'u-bob',
          orders: [
            { id: '2', userId: 'u-bob' },
            { id: '7', userId: 'u-bob' },
          ],
        },
      ],
    });
  });

  test('returns its store to the fake data on reset, which answers only to the service token', async () => {
    const dataSource = service.app.get<DataSource>(DataSource, {
      strict: false,
    });
    await dataSource.query(
      "UPDATE orders SET symbol = 'CHANGED-USD' WHERE id = 1",
    );
    const reset = () =>
      request(`${service.url}/internal/lab/reset`, { method: 'POST' });

    expect((await reset()).status).toBe(401);
    expect(
      (
        await request(`${service.url}/internal/lab/reset`, {
          method: 'POST',
          headers: { 'x-internal-token': SERVICE_TOKEN },
        })
      ).status,
    ).toBe(200);
    expect(
      (await query('{ orders { id symbol } }', { token: tokenOf('u-alice') }))
        .data,
    ).toEqual({
      orders: [
        { id: '1', symbol: 'BTC-USD' },
        { id: '6', symbol: 'SOL-USD' },
      ],
    });
  });

  // A scenario is allowed to drop a table. Reset puts it back, with the fake data in it.
  test('recreates a dropped table on reset', async () => {
    const dataSource = service.app.get<DataSource>(DataSource, {
      strict: false,
    });
    await dataSource.query('DROP TABLE orders');
    expect(
      errorCode(
        await query('{ orders { id } }', { token: tokenOf('u-alice') }),
      ),
    ).toBe('INTERNAL_SERVER_ERROR');

    const reset = await request(`${service.url}/internal/lab/reset`, {
      method: 'POST',
      headers: { 'x-internal-token': SERVICE_TOKEN },
    });

    expect(reset.status).toBe(200);
    expect(
      (await query('{ orders { id userId } }', { token: tokenOf('u-bob') }))
        .data,
    ).toEqual({
      orders: [
        { id: '2', userId: 'u-bob' },
        { id: '7', userId: 'u-bob' },
      ],
    });
  });

  // What the gateway composes from: an order with a key that provides the user's key, and the user entity this service adds to.
  test('generates a federation schema with the keys, the provided field and the external field', () => {
    const schema = readFileSync(
      new URL('../schema.gql', import.meta.url),
      'utf8',
    );

    expect(schema).toContain('type Order @key(fields: "id")');
    expect(schema).toContain('type User @key(fields: "id")');
    expect(schema).toContain('user: User! @provides(fields: "id")');
    expect(schema).toContain('id: ID! @external');
    for (const scalar of ['Decimal', 'DateTime', 'JSON']) {
      expect(schema).toContain(`scalar ${scalar}`);
    }
  });
});
