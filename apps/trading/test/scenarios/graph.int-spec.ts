import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import {
  errorCode,
  graphql,
  request,
  runSecret,
  sessionToken,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../../src/app.module.js';

// The graph family: an unbounded limit (RES-002) and an entity reference built
// from the caller's input (GQL-006).
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

afterAll(async () => {
  await service?.stop();
});

const tokenOf = (sub: string, role: 'ADMIN' | 'USER' = 'USER'): string =>
  sessionToken(JWT_SECRET, { sub, sid: `s-${sub}`, role });
const alice = tokenOf('u-alice');
const bob = tokenOf('u-bob');
const query = (
  source: string,
  options: {
    token?: string;
    variables?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
) => graphql(`${service.url}/graphql`, source, options);
const reset = () =>
  request(`${service.url}/internal/lab/reset`, {
    method: 'POST',
    headers: { 'x-internal-token': SERVICE_TOKEN },
  });

describe('RES-002 — allTrades has no cap on limit', () => {
  const PAYLOAD = { symbol: 'BTC-USD', limit: 100000 };
  const ALL =
    'query($symbol: String!, $limit: Int!) { allTrades(symbol: $symbol, limit: $limit) { id } }';
  const CAPPED =
    'query($symbol: String!, $limit: Int!) { trades(symbol: $symbol, limit: $limit) { id } }';
  const NAMED =
    'query($symbol: String!, $limit: Int!) { tradesNamed(symbol: $symbol, limit: $limit) { id } }';

  // The table holds 253 trades of BTC-USD: the three the seed wrote, and 250 more.
  beforeEach(async () => {
    await reset();
    const dataSource = service.app.get<DataSource>(DataSource, {
      strict: false,
    });
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('trades')
      .values(
        Array.from({ length: 250 }, (_, index) => ({
          orderId: 1,
          tickId: `bulk-${index}`,
          userId: 'u-alice',
          symbol: 'BTC-USD',
          side: 'BUY',
          price: '640000',
          quantity: '10000',
          fee: '1',
          executedAt: new Date(2026, 0, 2, 0, index / 60, index % 60),
        })),
      )
      .execute();
  });

  test('the unbounded limit returns every row the table holds: 253', async () => {
    const answer = await query(ALL, { token: bob, variables: PAYLOAD });

    // What was gained: the whole table in one answer, whatever its size — 253 rows for a limit of 100000.
    expect(answer.errors).toBeUndefined();
    expect((answer.data!.allTrades as unknown[]).length).toBe(253);
  });

  test('the trades counterpart caps the same limit at 200', async () => {
    const answer = await query(CAPPED, { token: bob, variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    expect((answer.data!.trades as unknown[]).length).toBe(200);
  });

  test('the tradesNamed counterpart pages at most 200', async () => {
    const answer = await query(NAMED, { token: bob, variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    expect((answer.data!.tradesNamed as unknown[]).length).toBe(200);
  });
});

describe('GQL-006 — giftOrder builds the user reference from the input', () => {
  const PAYLOAD = {
    toUserId: 'u-erin',
    input: {
      symbol: 'BTC-USD',
      side: 'BUY',
      type: 'MARKET',
      quantity: '0.10000000',
    },
  };
  const GIFT =
    'mutation($toUserId: ID!, $input: PlaceOrderInput!) { giftOrder(toUserId: $toUserId, input: $input) { id userId user { id } } }';
  const PLACE =
    'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { id userId user { id } } }';
  const ENTITIES =
    'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { id orders { id } } } }';

  beforeEach(reset);

  test('the order is stored as Alice\u2019s and points at Erin', async () => {
    const answer = await query(GIFT, { token: alice, variables: PAYLOAD });

    // What was gained: a user reference the caller chose. The gateway will resolve
    // u-erin's profile fields for an order Alice placed and paid for.
    expect(answer.errors).toBeUndefined();
    expect(answer.data?.giftOrder).toMatchObject({
      userId: 'u-alice',
      user: { id: 'u-erin' },
    });
  });

  test('the placeOrder counterpart: no toUserId exists to send, and the reference is the stored user', async () => {
    const refused = await query(PLACE, {
      token: alice,
      variables: {
        input: { ...PAYLOAD.input, toUserId: PAYLOAD.toUserId },
      },
    });
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(refused.errors?.[0]?.message).toContain('is not defined by type');

    const placed = await query(PLACE, {
      token: alice,
      variables: { input: PAYLOAD.input },
    });
    expect(placed.errors).toBeUndefined();
    expect(placed.data?.placeOrder).toMatchObject({
      userId: 'u-alice',
      user: { id: 'u-alice' },
    });
  });

  test('the User.orders counterpart refuses Alice on Erin\u2019s orders: FORBIDDEN', async () => {
    const answer = await query(ENTITIES, {
      token: alice,
      variables: {
        representations: [{ __typename: 'User', id: 'u-erin' }],
      },
      // As the gateway calls an entity: with the service token, so that the resolver is reached.
      headers: { 'x-internal-token': SERVICE_TOKEN },
    });

    expect(errorCode(answer)).toBe('FORBIDDEN');
  });
});
