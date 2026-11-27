import { FastifyAdapter } from '@nestjs/platform-fastify';
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

// The ACCESS family: five ways authorization was left out. One payload per
// scenario, sent to the vulnerable operation and to each protected counterpart.
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
const query = (
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
) => graphql(`${service.url}/graphql`, source, options);
const call = (path: string, init: RequestInit = {}) =>
  request(`${service.url}${path}`, init);
const reset = () =>
  call('/internal/lab/reset', {
    method: 'POST',
    headers: { 'x-internal-token': SERVICE_TOKEN },
  });
const jsonCall = (path: string, method: string, token: string, body: unknown) =>
  call(path, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

describe('ACCESS-008 — walletOf: another user\u2019s balances by id', () => {
  const PAYLOAD = { userId: 'u-erin' };
  const WALLET_OF =
    'query($userId: ID!) { walletOf(userId: $userId) { asset balance } }';
  const OWN = '{ wallet { asset balance } ledger { asset amount } }';
  const WALLETS =
    'query($userId: ID!) { wallets(userId: $userId) { asset balance } }';

  beforeEach(reset);

  test('the payload reads Erin\u2019s six balances', async () => {
    const answer = await query(WALLET_OF, { token: alice, variables: PAYLOAD });

    // Alice gained Erin's balances: the 500.00 dollars and the five empty coin wallets.
    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({
      walletOf: [
        { asset: 'BTC', balance: '0.00000000' },
        { asset: 'DOGE', balance: '0.00000000' },
        { asset: 'ETH', balance: '0.00000000' },
        { asset: 'SOL', balance: '0.00000000' },
        { asset: 'USD', balance: '500.00' },
        { asset: 'XRP', balance: '0.00000000' },
      ],
    });
  });

  test('the own-data counterparts have no userId argument to give: Alice\u2019s own', async () => {
    const answer = await query(OWN, { token: alice });

    expect(answer.errors).toBeUndefined();
    expect(
      (answer.data?.wallet as Array<{ asset: string; balance: string }>).find(
        (wallet) => wallet.asset === 'USD',
      ),
    ).toEqual({ asset: 'USD', balance: '10000.00' });
    expect(answer.data?.ledger).toEqual([{ asset: 'USD', amount: '10000.00' }]);
  });

  test('the admin counterpart refuses a user: FORBIDDEN', async () => {
    expect(
      errorCode(await query(WALLETS, { token: alice, variables: PAYLOAD })),
    ).toBe('FORBIDDEN');
  });
});

describe('ACCESS-002 — orderDetails: no ownership check', () => {
  const PAYLOAD = { id: '2' };
  const DETAILS =
    'query($id: ID!) { orderDetails(id: $id) { id userId memo limitPrice } }';
  const BY_ID =
    'query($id: ID!) { order(id: $id) { id userId memo limitPrice } }';
  const ENTITIES =
    'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { id orders { id } } } }';

  beforeEach(reset);

  test('the payload reads Bob\u2019s order, memo and price', async () => {
    const answer = await query(DETAILS, { token: alice, variables: PAYLOAD });

    // Alice gained Bob's order: its id, his note, the price he named.
    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({
      orderDetails: {
        id: '2',
        userId: 'u-bob',
        memo: 'stop loss above entry',
        limitPrice: '66000.00',
      },
    });
  });

  test('the repository counterpart refuses it: FORBIDDEN, read by who placed it', async () => {
    expect(
      errorCode(await query(BY_ID, { token: alice, variables: PAYLOAD })),
    ).toBe('FORBIDDEN');
  });

  test('the entity counterpart refuses it: FORBIDDEN, no identifier to change', async () => {
    expect(
      errorCode(
        await query(ENTITIES, {
          token: alice,
          variables: {
            representations: [{ __typename: 'User', id: 'u-bob' }],
          },
        }),
      ),
    ).toBe('FORBIDDEN');
  });
});

describe('ACCESS-009 — creditWallet: a user credits a wallet', () => {
  const PAYLOAD = { userId: 'u-alice', amount: '500.00' };
  const CREDIT =
    'mutation($userId: ID!, $amount: Decimal!) { creditWallet(userId: $userId, amount: $amount) { asset balance } }';
  const DEPOSIT =
    'mutation($userId: ID!, $amount: Decimal!) { deposit(userId: $userId, amount: $amount) { asset balance } }';

  beforeEach(reset);

  test('Alice credits herself five hundred dollars', async () => {
    const answer = await query(CREDIT, { token: alice, variables: PAYLOAD });

    // Alice gained money: 10000.00 became 10500.00, on her own token.
    expect(answer.errors).toBeUndefined();
    expect(
      (
        answer.data?.creditWallet as Array<{ asset: string; balance: string }>
      ).find((wallet) => wallet.asset === 'USD'),
    ).toEqual({ asset: 'USD', balance: '10500.00' });
  });

  test('the GraphQL counterpart refuses a user: FORBIDDEN, needs ADMIN', async () => {
    expect(
      errorCode(await query(DEPOSIT, { token: alice, variables: PAYLOAD })),
    ).toBe('FORBIDDEN');
  });

  test('the REST counterpart refuses a user: 403, the roles guard', async () => {
    const answer = await jsonCall(
      '/internal/admin/deposits',
      'POST',
      alice,
      PAYLOAD,
    );

    expect(answer.status).toBe(403);
  });
});

describe('ACCESS-010 — PATCH /internal/orders/:id: mass assignment', () => {
  const PAYLOAD = {
    memo: 'patched by the scenario',
    status: 'FILLED',
    userId: 'u-bob',
  };
  const READ_ORDER =
    'query($id: ID!) { orderDetails(id: $id) { id userId memo status } }';
  const UPDATE =
    'mutation($id: ID!, $input: UpdateOrderInput!) { updateOrder(id: $id, input: $input) { id userId memo status } }';

  beforeEach(reset);

  test('the payload stores a status and a user the caller never owned', async () => {
    const patched = await jsonCall(
      '/internal/orders/1',
      'PATCH',
      alice,
      PAYLOAD,
    );

    expect(patched.status).toBe(200);
    const read = await query(READ_ORDER, {
      token: alice,
      variables: { id: '1' },
    });

    // Alice gained writes the route never offered: her OPEN order is FILLED and belongs to Bob now.
    expect(read.errors).toBeUndefined();
    expect(read.data).toEqual({
      orderDetails: {
        id: '1',
        userId: 'u-bob',
        memo: 'patched by the scenario',
        status: 'FILLED',
      },
    });
  });

  test('the input counterpart refuses it: UpdateOrderInput has memo alone', async () => {
    const answer = await query(UPDATE, {
      token: alice,
      variables: { id: '1', input: PAYLOAD },
    });

    // The schema itself names the refusal: UpdateOrderInput declares memo alone.
    expect(errorCode(answer)).toBe('BAD_USER_INPUT');
    expect(answer.errors?.[0]?.message).toContain('is not defined by type');
  });

  test('the PUT counterpart writes the memo alone: OPEN and u-alice stay', async () => {
    const answer = await jsonCall('/internal/orders/1', 'PUT', alice, PAYLOAD);

    expect(answer.status).toBe(200);
    const read = await query(READ_ORDER, {
      token: alice,
      variables: { id: '1' },
    });

    expect(read.errors).toBeUndefined();
    expect(read.data).toEqual({
      orderDetails: {
        id: '1',
        userId: 'u-alice',
        memo: 'patched by the scenario',
        status: 'OPEN',
      },
    });
  });
});

describe('ACCESS-007 — setReferencePrice: a user moves a market', () => {
  const PAYLOAD = { symbol: 'BTC-USD', price: '1.00' };
  const SET =
    'mutation($symbol: String!, $price: Decimal!) { setReferencePrice(symbol: $symbol, price: $price) { symbol referencePrice } }';
  const TICK = 'mutation { tickPrices { symbol referencePrice } }';
  const BUY =
    'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { id status limitPrice } }';

  beforeEach(reset);

  test('Alice sets BTC-USD to a dollar, then buys a bitcoin for a dollar', async () => {
    const answer = await query(SET, { token: alice, variables: PAYLOAD });

    // The price moved on a user's token: an administrator's operation answered to Alice.
    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({
      setReferencePrice: { symbol: 'BTC-USD', referencePrice: '1.00' },
    });

    const buy = await query(BUY, {
      token: alice,
      variables: {
        input: {
          symbol: 'BTC-USD',
          side: 'BUY',
          type: 'MARKET',
          quantity: '1.00000000',
        },
      },
    });
    expect(buy.errors).toBeUndefined();

    // What was gained: one whole bitcoin, for one dollar.
    const wallets = await query('{ wallet { asset balance } }', {
      token: alice,
    });
    const of = (asset: string) =>
      (wallets.data?.wallet as Array<{ asset: string; balance: string }>).find(
        (wallet) => wallet.asset === asset,
      );
    expect(of('BTC')).toEqual({ asset: 'BTC', balance: '1.00000000' });
    expect(of('USD')).toEqual({ asset: 'USD', balance: '9999.00' });
  });

  test('the GraphQL counterpart refuses a user: FORBIDDEN, needs ADMIN', async () => {
    expect(errorCode(await query(TICK, { token: alice }))).toBe('FORBIDDEN');
  });

  test('the REST counterpart refuses a user: 403, the roles guard', async () => {
    const answer = await jsonCall(
      '/internal/admin/prices/tick',
      'POST',
      alice,
      {},
    );

    expect(answer.status).toBe(403);
  });
});
