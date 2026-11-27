import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Decimal } from 'decimal.js';
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
import { AppModule } from '../src/app.module.js';

// The safe operations of the service: what each row of the service
// specification says it does, the money the ledger says was conserved, the
// refusals the caller roles and the object owners meet, and the races the
// conditional updates hold.
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
const admin = tokenOf('u-admin', 'ADMIN');
const query = (
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
) => graphql(`${service.url}/graphql`, source, options);
const call = (path: string, init: RequestInit = {}) =>
  request(`${service.url}${path}`, init);
const rest = (path: string, method: string, token: string, body?: unknown) =>
  call(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      authorization: `Bearer ${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const reset = () =>
  call('/internal/lab/reset', {
    method: 'POST',
    headers: { 'x-internal-token': SERVICE_TOKEN },
  });
const usdOf = async (token: string): Promise<string> => {
  const answer = await query('{ wallet { asset balance } }', { token });
  return (
    answer.data?.wallet as Array<{ asset: string; balance: string }>
  ).find((wallet) => wallet.asset === 'USD')!.balance;
};
const assetOf = async (
  token: string,
  asset: string,
): Promise<string | undefined> => {
  const answer = await query('{ wallet { asset balance } }', { token });
  return (
    answer.data?.wallet as Array<{ asset: string; balance: string }>
  ).find((wallet) => wallet.asset === asset)?.balance;
};

// AC1 — the fake data, after a start and again after a reset.
describe('the fake data (AC1)', () => {
  const expectSeed = async () => {
    const wallets = await query(
      'query($userId: ID!) { wallets(userId: $userId) { asset balance } }',
      { token: admin, variables: { userId: 'u-alice' } },
    );
    expect(wallets.data?.wallets).toEqual([
      { asset: 'BTC', balance: '0.00000000' },
      { asset: 'DOGE', balance: '0.00000000' },
      { asset: 'ETH', balance: '0.00000000' },
      { asset: 'SOL', balance: '0.00000000' },
      { asset: 'USD', balance: '10000.00' },
      { asset: 'XRP', balance: '0.00000000' },
    ]);

    const markets = await query('{ markets { symbol referencePrice } }');
    expect(markets.data?.markets).toEqual([
      { symbol: 'BTC-USD', referencePrice: '65000.00' },
      { symbol: 'DOGE-USD', referencePrice: '0.12' },
      { symbol: 'ETH-USD', referencePrice: '3200.00' },
      { symbol: 'SOL-USD', referencePrice: '150.00' },
      { symbol: 'XRP-USD', referencePrice: '0.50' },
    ]);

    // Two open limit orders per market, from different users: ten in all.
    const open = await query(
      'query { ordersAmong(ids: ["1","2","3","4","5","6","7","8","9","10"]) { id userId } }',
      { token: admin },
    );
    expect(open.data?.ordersAmong).toEqual([]); // none of them is the administrator's own
    const erinOrders = await query(
      'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { id orders { id userId } } } }',
      {
        token: admin,
        variables: { representations: [{ __typename: 'User', id: 'u-erin' }] },
      },
    );
    expect(erinOrders.data).toEqual({
      _entities: [
        {
          id: 'u-erin',
          orders: [
            { id: '5', userId: 'u-erin' },
            { id: '10', userId: 'u-erin' },
          ],
        },
      ],
    });

    // Three trades per market, and one report per user.
    const dataSource = service.app.get<DataSource>(DataSource, {
      strict: false,
    });
    const trades = await dataSource.query(
      'SELECT symbol, COUNT(*) AS count FROM trades GROUP BY symbol ORDER BY symbol',
    );
    expect(trades).toEqual([
      { symbol: 'BTC-USD', count: '3' },
      { symbol: 'DOGE-USD', count: '3' },
      { symbol: 'ETH-USD', count: '3' },
      { symbol: 'SOL-USD', count: '3' },
      { symbol: 'XRP-USD', count: '3' },
    ]);
    const reports = await dataSource.query(
      'SELECT userId, kind FROM reports ORDER BY userId',
    );
    expect(reports).toEqual([
      { userId: 'u-alice', kind: 'statement' },
      { userId: 'u-bob', kind: 'statement' },
      { userId: 'u-carol', kind: 'statement' },
      { userId: 'u-dave', kind: 'statement' },
      { userId: 'u-erin', kind: 'statement' },
    ]);
  };

  test('holds after a start', expectSeed);
  test('holds again after a reset', async () => {
    await reset();
    await expectSeed();
  });
});

// AC2 — every safe operation does what its row says.
describe('the safe operations (AC2)', () => {
  describe('markets(q)', () => {
    test('answers every market, and a bound search of them', async () => {
      const all = await query('{ markets { symbol } }');
      expect(all.data?.markets).toHaveLength(5);
      const some = await query(
        'query($q: String) { markets(q: $q) { symbol } }',
        { variables: { q: 'USD' } },
      );
      expect(some.data?.markets).toHaveLength(5);
      const none = await query(
        'query($q: String) { markets(q: $q) { symbol } }',
        {
          variables: { q: 'zzz' },
        },
      );
      expect(none.data?.markets).toEqual([]);
    });
  });

  test('marketsByAssets answers the markets of an enum list', async () => {
    const answer = await query(
      'query($assets: [Asset!]!) { marketsByAssets(assets: $assets) { symbol baseAsset } }',
      { variables: { assets: ['BTC', 'ETH'] } },
    );
    expect(answer.data?.marketsByAssets).toEqual([
      { symbol: 'BTC-USD', baseAsset: 'BTC' },
      { symbol: 'ETH-USD', baseAsset: 'ETH' },
    ]);
  });

  test('trades answers a symbol, ordered and paged', async () => {
    const answer = await query(
      'query($symbol: String!, $orderBy: TradeOrderBy) { trades(symbol: $symbol, orderBy: $orderBy) { price } }',
      { variables: { symbol: 'BTC-USD', orderBy: 'PRICE_HIGH' } },
    );
    expect(answer.data?.trades).toEqual([
      { price: '6550.00' },
      { price: '6450.00' },
      { price: '6400.00' },
    ]);
  });

  test('tradesNamed answers with named parameters and a side filter', async () => {
    const answer = await query(
      'query($symbol: String!, $side: Side) { tradesNamed(symbol: $symbol, side: $side) { side } }',
      { variables: { symbol: 'BTC-USD', side: 'BUY' } },
    );
    expect(answer.data?.tradesNamed).toEqual([
      { side: 'BUY' },
      { side: 'BUY' },
    ]);
  });

  test('highPrice answers the highest fill of a market', async () => {
    const answer = await query(
      'query($symbol: String!) { highPrice(symbol: $symbol) }',
      { variables: { symbol: 'BTC-USD' } },
    );
    expect(answer.data).toEqual({ highPrice: '6550.00' });
  });

  test('settlementPrice answers the reference price, prepared', async () => {
    const answer = await query(
      'query($symbol: String!) { settlementPrice(symbol: $symbol) }',
      { variables: { symbol: 'DOGE-USD' } },
    );
    expect(answer.data).toEqual({ settlementPrice: '0.12' });
  });

  test('order answers the caller\u2019s own order', async () => {
    const answer = await query(
      'query($id: ID!) { order(id: $id) { id userId } }',
      {
        token: alice,
        variables: { id: '1' },
      },
    );
    expect(answer.data?.order).toEqual({ id: '1', userId: 'u-alice' });
  });

  test('orderByReference answers by the reference, ownership checked', async () => {
    const answer = await query(
      'query($ref: String!) { orderByReference(ref: $ref) { id userId } }',
      { token: alice, variables: { ref: 'ord-1' } },
    );
    expect(answer.data?.orderByReference).toEqual({
      id: '1',
      userId: 'u-alice',
    });
  });

  test('ordersAmong answers the caller\u2019s orders among a list', async () => {
    const answer = await query(
      'query($ids: [ID!]!) { ordersAmong(ids: $ids) { id userId } }',
      { token: alice, variables: { ids: ['1', '2', '6'] } },
    );
    expect(answer.data?.ordersAmong).toEqual([
      { id: '1', userId: 'u-alice' },
      { id: '6', userId: 'u-alice' },
    ]);
  });

  test('wallet answers the caller\u2019s balances', async () => {
    const answer = await query('{ wallet { asset balance } }', { token: bob });
    expect(
      (answer.data?.wallet as Array<{ asset: string; balance: string }>).find(
        (wallet) => wallet.asset === 'USD',
      ),
    ).toEqual({ asset: 'USD', balance: '5000.00' });
    expect(answer.data?.wallet).toHaveLength(6);
  });

  test('ledger answers the caller\u2019s entries', async () => {
    const answer = await query('{ ledger { asset amount kind } }', {
      token: alice,
    });
    expect(answer.data?.ledger).toEqual([
      { asset: 'USD', amount: '10000.00', kind: 'DEPOSIT' },
    ]);
  });

  test('wallets answers any user\u2019s balances, to an administrator', async () => {
    const answer = await query(
      'query($userId: ID!) { wallets(userId: $userId) { asset balance } }',
      { token: admin, variables: { userId: 'u-erin' } },
    );
    expect(answer.data?.wallets).toHaveLength(6);
  });

  describe('User.orders', () => {
    test('answers a user\u2019s orders through the entity', async () => {
      const answer = await query(
        'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { id orders { id userId } } } }',
        {
          token: admin,
          variables: { representations: [{ __typename: 'User', id: 'u-bob' }] },
        },
      );
      expect(answer.data).toEqual({
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
  });

  describe('deposit', () => {
    beforeEach(reset);
    test('an administrator credits a wallet', async () => {
      const answer = await query(
        'mutation($userId: ID!, $amount: Decimal!) { deposit(userId: $userId, amount: $amount) { asset balance } }',
        { token: admin, variables: { userId: 'u-erin', amount: '500.00' } },
      );
      expect(
        (
          answer.data?.deposit as Array<{ asset: string; balance: string }>
        ).find((wallet) => wallet.asset === 'USD'),
      ).toEqual({ asset: 'USD', balance: '1000.00' });
    });
  });

  describe('withdraw', () => {
    beforeEach(reset);
    test('the caller withdraws from their own wallet', async () => {
      const answer = await query(
        'mutation($amount: Decimal!) { withdraw(amount: $amount) { asset balance } }',
        { token: alice, variables: { amount: '200.00' } },
      );
      expect(
        (
          answer.data?.withdraw as Array<{ asset: string; balance: string }>
        ).find((wallet) => wallet.asset === 'USD'),
      ).toEqual({ asset: 'USD', balance: '9800.00' });
    });
    test('refuses more than the balance', async () => {
      const answer = await query(
        'mutation($amount: Decimal!) { withdraw(amount: $amount) { asset balance } }',
        { token: alice, variables: { amount: '10000.01' } },
      );
      expect(errorCode(answer)).toBe('CONFLICT');
    });
  });

  describe('tickPrices', () => {
    beforeEach(reset);
    test('moves every price and fills the crossed orders once', async () => {
      const answer = await query(
        'mutation { tickPrices { symbol referencePrice } }',
        { token: admin },
      );
      const btc = (
        answer.data?.tickPrices as Array<{
          symbol: string;
          referencePrice: string;
        }>
      ).find((market) => market.symbol === 'BTC-USD');
      expect(btc).toEqual({ symbol: 'BTC-USD', referencePrice: '63700.00' });
      const order = await query(
        'query($id: ID!) { order(id: $id) { id status } }',
        { token: alice, variables: { id: '1' } },
      );
      expect(order.data?.order).toEqual({ id: '1', status: 'FILLED' });
      expect(await assetOf(alice, 'BTC')).toBe('0.50000000');
    });
  });

  describe('settleOrder', () => {
    beforeEach(reset);
    test('an administrator fills an order on a named tick, once', async () => {
      const first = await query(
        'mutation($orderId: ID!, $tickId: ID!) { settleOrder(orderId: $orderId, tickId: $tickId) { id status } }',
        { token: admin, variables: { orderId: '1', tickId: 'tick-safe-1' } },
      );
      expect(first.data?.settleOrder).toEqual({ id: '1', status: 'FILLED' });
      const second = await query(
        'mutation($orderId: ID!, $tickId: ID!) { settleOrder(orderId: $orderId, tickId: $tickId) { id status } }',
        { token: admin, variables: { orderId: '1', tickId: 'tick-safe-1' } },
      );
      expect(second.data?.settleOrder).toEqual({ id: '1', status: 'FILLED' });
      expect(await assetOf(alice, 'BTC')).toBe('0.50000000');
    });
  });

  describe('placeOrder', () => {
    beforeEach(reset);
    test('a limit order takes its funds at once', async () => {
      const answer = await query(
        'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { id status type memo } }',
        {
          token: alice,
          variables: {
            input: {
              symbol: 'DOGE-USD',
              side: 'BUY',
              type: 'LIMIT',
              limitPrice: '0.12',
              quantity: '100.00000000',
              memo: 'a safe limit order',
            },
          },
        },
      );
      expect(answer.data?.placeOrder).toMatchObject({
        status: 'OPEN',
        type: 'LIMIT',
        memo: 'a safe limit order',
      });
      // 100 DOGE at 0.12: twelve dollars held.
      expect(await usdOf(alice)).toBe('9988.00');
    });
    test('a market order fills at the server\u2019s price', async () => {
      const answer = await query(
        'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { status limitPrice } }',
        {
          token: alice,
          variables: {
            input: {
              symbol: 'BTC-USD',
              side: 'BUY',
              type: 'MARKET',
              quantity: '0.00010000',
            },
          },
        },
      );
      expect(answer.data?.placeOrder).toEqual({
        status: 'FILLED',
        limitPrice: '65000.00',
      });
      expect(await usdOf(alice)).toBe('9993.50');
      expect(await assetOf(alice, 'BTC')).toBe('0.00010000');
    });
  });

  describe('buyAtMarket', () => {
    beforeEach(reset);
    test('charges the server\u2019s price for the quantity', async () => {
      const answer = await query(
        'mutation($symbol: String!, $quantity: Decimal!) { buyAtMarket(symbol: $symbol, quantity: $quantity) { status limitPrice } }',
        {
          token: alice,
          variables: { symbol: 'BTC-USD', quantity: '0.00010000' },
        },
      );
      expect(answer.data?.buyAtMarket).toEqual({
        status: 'FILLED',
        limitPrice: '65000.00',
      });
      expect(await usdOf(alice)).toBe('9993.50');
    });
  });

  describe('cancelOrder', () => {
    beforeEach(reset);
    test('returns the funds of a cancelled limit order', async () => {
      const placed = await query(
        'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { id status } }',
        {
          token: alice,
          variables: {
            input: {
              symbol: 'DOGE-USD',
              side: 'BUY',
              type: 'LIMIT',
              limitPrice: '0.12',
              quantity: '100.00000000',
            },
          },
        },
      );
      const id = (placed.data?.placeOrder as { id: string }).id;
      expect(await usdOf(alice)).toBe('9988.00');

      const cancelled = await query(
        'mutation($id: ID!) { cancelOrder(id: $id) { id status } }',
        { token: alice, variables: { id } },
      );
      expect(cancelled.data?.cancelOrder).toEqual({
        id,
        status: 'CANCELLED',
      });
      expect(await usdOf(alice)).toBe('10000.00');
    });
  });

  describe('updateOrder', () => {
    beforeEach(reset);
    test('changes the memo of the caller\u2019s order', async () => {
      const answer = await query(
        'mutation($id: ID!, $input: UpdateOrderInput!) { updateOrder(id: $id, input: $input) { id memo status userId } }',
        {
          token: alice,
          variables: { id: '1', input: { memo: 'a new note' } },
        },
      );
      expect(answer.data?.updateOrder).toMatchObject({
        id: '1',
        memo: 'a new note',
        status: 'OPEN',
        userId: 'u-alice',
      });
    });
  });

  test('convertExact converts at the asset\u2019s scale, half up', async () => {
    // A half minor unit rounds away from zero, as the named mode says.
    const rounded = await query(
      'mutation($asset: Asset!, $amount: Decimal!) { convertExact(asset: $asset, amount: $amount) }',
      { token: alice, variables: { asset: 'USD', amount: '8.205' } },
    );
    expect(rounded.data).toEqual({ convertExact: '8.21' });
    const exact = await query(
      'mutation($asset: Asset!, $amount: Decimal!) { convertExact(asset: $asset, amount: $amount) }',
      { token: alice, variables: { asset: 'BTC', amount: '0.12345678' } },
    );
    expect(exact.data).toEqual({ convertExact: '0.12345678' });
  });

  test('orders answers the caller\u2019s orders', async () => {
    const answer = await query('{ orders { id userId } }', { token: alice });
    expect(answer.data?.orders).toEqual([
      { id: '1', userId: 'u-alice' },
      { id: '6', userId: 'u-alice' },
    ]);
  });

  describe('the REST routes', () => {
    beforeEach(reset);

    test('POST /internal/admin/deposits credits a wallet, for an administrator', async () => {
      const answer = await rest('/internal/admin/deposits', 'POST', admin, {
        userId: 'u-carol',
        amount: '250.00',
      });
      expect(answer.status).toBe(200);
      expect(
        (
          (await answer.json()).wallets as Array<{
            asset: string;
            balance: string;
          }>
        ).find((wallet) => wallet.asset === 'USD'),
      ).toMatchObject({ asset: 'USD', balance: '2750.00' });
    });

    test('POST /internal/admin/prices/tick moves the markets, for an administrator', async () => {
      const answer = await rest('/internal/admin/prices/tick', 'POST', admin);
      expect(answer.status).toBe(200);
      const markets = (await answer.json()).markets as Array<{
        symbol: string;
        referencePrice: string;
      }>;
      expect(
        markets.find((market) => market.symbol === 'BTC-USD'),
      ).toMatchObject({ symbol: 'BTC-USD', referencePrice: '63700.00' });
    });

    test('POST /internal/wallets/withdraw pays out of the caller\u2019s wallet', async () => {
      const answer = await rest('/internal/wallets/withdraw', 'POST', bob, {
        amount: '100.00',
      });
      expect(answer.status).toBe(200);
      expect(
        (
          (await answer.json()).wallets as Array<{
            asset: string;
            balance: string;
          }>
        ).find((wallet) => wallet.asset === 'USD'),
      ).toMatchObject({ asset: 'USD', balance: '4900.00' });
    });

    test('PUT /internal/orders/:id writes the memo alone', async () => {
      const answer = await rest('/internal/orders/1', 'PUT', alice, {
        memo: 'renamed safely',
        status: 'FILLED',
      });
      expect(answer.status).toBe(200);
      expect((await answer.json()).order).toMatchObject({
        id: '1',
        memo: 'renamed safely',
        status: 'OPEN',
        userId: 'u-alice',
      });
    });

    test('GET /internal/reports/:id answers the caller\u2019s report', async () => {
      const answer = await rest('/internal/reports/1', 'GET', alice);
      expect(answer.status).toBe(200);
      expect(await answer.json()).toMatchObject({
        report: { storedName: 'statement-u-alice.csv' },
      });
    });

    test('GET /internal/reports/file/:name serves a stored report of the caller\u2019s', async () => {
      const answer = await call(
        '/internal/reports/file/statement-u-alice.csv',
        {
          headers: { authorization: `Bearer ${alice}` },
        },
      );
      expect(answer.status).toBe(200);
      expect(await answer.text()).toContain('asset,balance');
    });

    test('GET /internal/reports/trades.csv writes every cell as text', async () => {
      const answer = await call('/internal/reports/trades.csv', {
        headers: { authorization: `Bearer ${alice}` },
      });
      expect(await answer.text()).toContain("'=zazzles-lab-marker");
    });

    test('GET /internal/reports/trades.json answers an attachment', async () => {
      const answer = await call('/internal/reports/trades.json', {
        headers: { authorization: `Bearer ${alice}` },
      });
      expect(answer.headers.get('content-disposition')).toBe(
        'attachment; filename="trades.json"',
      );
      const body = (await answer.json()) as { trades: unknown[] };
      expect(body.trades.length).toBeGreaterThan(0);
    });
  });
});

// AC3 — money is conserved: after a sequence of safe operations, every balance
// is the sum of that user's ledger entries for that asset.
describe('money is conserved by the safe operations (AC3)', () => {
  test('each balance equals the sum of its ledger entries', async () => {
    await reset();
    await query(
      'mutation($userId: ID!, $amount: Decimal!) { deposit(userId: $userId, amount: $amount) { asset } }',
      { token: admin, variables: { userId: 'u-alice', amount: '500.00' } },
    );
    await query(
      'mutation($amount: Decimal!) { withdraw(amount: $amount) { asset } }',
      {
        token: alice,
        variables: { amount: '200.00' },
      },
    );
    await query(
      'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { id } }',
      {
        token: alice,
        variables: {
          input: {
            symbol: 'DOGE-USD',
            side: 'BUY',
            type: 'LIMIT',
            limitPrice: '0.12',
            quantity: '100.00000000',
          },
        },
      },
    );
    await query(
      'mutation($symbol: String!, $quantity: Decimal!) { buyAtMarket(symbol: $symbol, quantity: $quantity) { id } }',
      {
        token: alice,
        variables: { symbol: 'BTC-USD', quantity: '0.00010000' },
      },
    );
    await query(
      'mutation($id: ID!, $input: UpdateOrderInput!) { updateOrder(id: $id, input: $input) { id } }',
      {
        token: alice,
        variables: { id: '6', input: { memo: 'still resting' } },
      },
    );
    await query('mutation { tickPrices { symbol } }', { token: admin });
    await rest('/internal/admin/deposits', 'POST', admin, {
      userId: 'u-bob',
      amount: '75.00',
    });
    await rest('/internal/wallets/withdraw', 'POST', bob, { amount: '25.00' });

    const dataSource = service.app.get<DataSource>(DataSource, {
      strict: false,
    });
    const wallets = (await dataSource.query(
      'SELECT userId, asset, balance FROM wallets',
    )) as Array<{ userId: string; asset: string; balance: string }>;
    const entries = (await dataSource.query(
      'SELECT userId, asset, amount FROM ledger_entries',
    )) as Array<{ userId: string; asset: string; amount: string }>;

    expect(wallets.length).toBe(30);
    for (const wallet of wallets) {
      const summed = entries
        .filter(
          (entry) =>
            entry.userId === wallet.userId && entry.asset === wallet.asset,
        )
        .reduce(
          (sum, entry) => sum.plus(new Decimal(entry.amount)),
          new Decimal(0),
        );
      expect(
        summed.eq(new Decimal(wallet.balance)),
        `${wallet.userId}/${wallet.asset}: ${summed} against ${wallet.balance}`,
      ).toBe(true);
    }
  });
});

// AC4 — authorization: the roles an operation names, and the objects it owns.
describe('authorization (AC4)', () => {
  beforeEach(reset);

  test('every operation marked admin answers FORBIDDEN to a user', async () => {
    expect(
      errorCode(
        await query(
          'query($userId: ID!) { wallets(userId: $userId) { asset } }',
          {
            token: alice,
            variables: { userId: 'u-erin' },
          },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query(
          'mutation($userId: ID!, $amount: Decimal!) { deposit(userId: $userId, amount: $amount) { asset } }',
          {
            token: alice,
            variables: { userId: 'u-alice', amount: '1.00' },
          },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query('mutation { tickPrices { symbol } }', { token: alice }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query(
          'mutation($orderId: ID!, $tickId: ID!) { settleOrder(orderId: $orderId, tickId: $tickId) { id } }',
          {
            token: alice,
            variables: { orderId: '1', tickId: 'tick-x' },
          },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query(
          'mutation($orderId: ID!) { matchOrder(orderId: $orderId) { id } }',
          {
            token: alice,
            variables: { orderId: '1' },
          },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      (
        await rest('/internal/admin/deposits', 'POST', alice, {
          userId: 'u-alice',
          amount: '1.00',
        })
      ).status,
    ).toBe(403);
    expect(
      (await rest('/internal/admin/prices/tick', 'POST', alice, {})).status,
    ).toBe(403);
  });

  test('every own-data operation answers FORBIDDEN for another user\u2019s object', async () => {
    expect(
      errorCode(
        await query('query($id: ID!) { order(id: $id) { id } }', {
          token: alice,
          variables: { id: '2' },
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query(
          'query($ref: String!) { orderByReference(ref: $ref) { id } }',
          {
            token: alice,
            variables: { ref: 'ord-2' },
          },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query(
          'mutation($id: ID!, $input: UpdateOrderInput!) { updateOrder(id: $id, input: $input) { id } }',
          {
            token: alice,
            variables: { id: '2', input: { memo: 'x' } },
          },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query('mutation($id: ID!) { cancelOrder(id: $id) { id } }', {
          token: alice,
          variables: { id: '2' },
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query('mutation($id: ID!) { cancelOrder(id: $id) { id } }', {
          token: alice,
          variables: { id: '1' },
        }),
      ),
    ).toBeUndefined();
    expect(
      (await rest('/internal/orders/2', 'PUT', alice, { memo: 'x' })).status,
    ).toBe(403);
    expect((await rest('/internal/reports/1', 'GET', bob)).status).toBe(404);
    expect(
      (
        await call('/internal/reports/file/statement-u-alice.csv', {
          headers: { authorization: `Bearer ${bob}` },
        })
      ).status,
    ).toBe(404);
  });

  test('NOT_FOUND where nothing is stored', async () => {
    expect(
      errorCode(
        await query('query($id: ID!) { order(id: $id) { id } }', {
          token: alice,
          variables: { id: '99' },
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      errorCode(
        await query(
          'query($ref: String!) { orderByReference(ref: $ref) { id } }',
          {
            token: alice,
            variables: { ref: 'ord-99' },
          },
        ),
      ),
    ).toBe('NOT_FOUND');
    expect((await rest('/internal/reports/99', 'GET', alice)).status).toBe(404);
    expect(
      errorCode(
        await query('query($symbol: String!) { highPrice(symbol: $symbol) }', {
          variables: { symbol: 'NOPE-USD' },
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      errorCode(
        await query(
          'query($symbol: String!) { settlementPrice(symbol: $symbol) }',
          {
            variables: { symbol: 'NOPE-USD' },
          },
        ),
      ),
    ).toBe('NOT_FOUND');
  });
});

// AC5 — concurrency: the races the conditional updates hold.
describe('concurrency (AC5)', () => {
  beforeEach(reset);

  test('ten parallel withdrawals answer once and refuse nine', async () => {
    const answers = await Promise.all(
      Array.from({ length: 10 }, () =>
        query(
          'mutation($amount: Decimal!) { withdraw(amount: $amount) { asset } }',
          {
            token: tokenOf('u-erin'),
            variables: { amount: '500.00' },
          },
        ),
      ),
    );
    expect(
      answers.filter((answer) => answer.errors === undefined),
    ).toHaveLength(1);
    expect(
      new Set(
        answers
          .filter((answer) => answer.errors !== undefined)
          .map((answer) => errorCode(answer)),
      ),
    ).toEqual(new Set(['CONFLICT']));
    expect(await usdOf(tokenOf('u-erin'))).toBe('0.00');
  });

  test('ten parallel REST withdrawals answer once and refuse nine', async () => {
    const answers = await Promise.all(
      Array.from({ length: 10 }, () =>
        rest('/internal/wallets/withdraw', 'POST', tokenOf('u-erin'), {
          amount: '500.00',
        }),
      ),
    );
    const statuses = answers.map((answer) => answer.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 400)).toHaveLength(9);
    expect(await usdOf(tokenOf('u-erin'))).toBe('0.00');
  });

  test('two parallel tickPrices fill an order once', async () => {
    const ticks = await Promise.all([
      query('mutation { tickPrices { symbol } }', { token: admin }),
      query('mutation { tickPrices { symbol } }', { token: admin }),
    ]);
    expect(ticks.filter((tick) => tick.errors === undefined)).toHaveLength(2);
    expect(await assetOf(alice, 'BTC')).toBe('0.50000000');
    const order = await query(
      'query($id: ID!) { order(id: $id) { id status } }',
      {
        token: alice,
        variables: { id: '1' },
      },
    );
    expect(order.data?.order).toEqual({ id: '1', status: 'FILLED' });
    const trades = await query(
      'query($symbol: String!) { trades(symbol: $symbol, limit: 200) { orderId } }',
      { variables: { symbol: 'BTC-USD' } },
    );
    expect(
      (trades.data?.trades as Array<{ orderId: string }>).filter(
        (trade) => trade.orderId === '1',
      ),
    ).toHaveLength(3); // the two the seed wrote, and the one fill
  });
});
