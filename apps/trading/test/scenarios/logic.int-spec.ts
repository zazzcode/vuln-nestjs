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

// The LOGIC family: five business-logic flaws. One payload per scenario, sent
// to the vulnerable operation and to each protected counterpart.
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
const erin = tokenOf('u-erin');
const admin = tokenOf('u-admin', 'ADMIN');
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
const walletOf = async (token: string, asset: string) => {
  const answer = await query(
    'query($userId: ID!) { walletOf(userId: $userId) { asset balance } }',
    { token, variables: { userId: token === erin ? 'u-erin' : 'u-alice' } },
  );
  return (
    answer.data?.walletOf as Array<{ asset: string; balance: string }>
  ).find((wallet) => wallet.asset === asset)?.balance;
};
const ledgerSum = async (token: string, userId: string) => {
  const answer = await query(
    'query($userId: ID!) { walletOf(userId: $userId) { asset } ledger { asset amount kind } }',
    { token, variables: { userId } },
  );
  void answer;
  const own = await query('{ ledger { asset amount kind } }', { token });
  return own.data?.ledger as Array<{
    asset: string;
    amount: string;
    kind: string;
  }>;
};

describe('LOGIC-001 — payout accepts a negative amount', () => {
  const PAYLOAD = { amount: '-500.00' };
  const PAYOUT =
    'mutation($amount: Decimal!) { payout(amount: $amount) { asset balance } }';
  const WITHDRAW =
    'mutation($amount: Decimal!) { withdraw(amount: $amount) { asset balance } }';

  beforeEach(reset);

  test('the payout of minus five hundred credits the wallet', async () => {
    const answer = await query(PAYOUT, { token: alice, variables: PAYLOAD });

    // Alice gained five hundred dollars: 10000.00 became 10500.00, by withdrawing a negative amount.
    expect(answer.errors).toBeUndefined();
    expect(await walletOf(alice, 'USD')).toBe('10500.00');
  });

  test('the GraphQL counterpart refuses it: below the minimum, BAD_USER_INPUT', async () => {
    const answer = await query(WITHDRAW, {
      token: alice,
      variables: PAYLOAD,
    });

    expect(errorCode(answer)).toBe('BAD_USER_INPUT');
    expect(answer.errors?.[0]?.message).toContain('0.01');
  });

  test('the REST counterpart refuses it: 400, the amount must be above zero', async () => {
    const answer = await call('/internal/wallets/withdraw', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${alice}`,
      },
      body: JSON.stringify(PAYLOAD),
    });

    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({
      message: 'amount must be above zero',
    });
  });
});

describe('LOGIC-002 — ten parallel payouts out of five hundred dollars', () => {
  const PAYOUT =
    'mutation($amount: Decimal!) { payout(amount: $amount) { asset balance } }';
  const WITHDRAW =
    'mutation($amount: Decimal!) { withdraw(amount: $amount) { asset balance } }';
  const TEN = Array.from({ length: 10 }, () => '500.00');

  test('the ten payouts are all answered: five thousand paid out of five hundred', async () => {
    const answers = await Promise.all(
      TEN.map((amount) =>
        query(PAYOUT, { token: erin, variables: { amount } }),
      ),
    );

    // Erin's balance was 500.00; every one of the ten parallel payouts was paid.
    expect(
      answers.filter((answer) => answer.errors === undefined),
    ).toHaveLength(10);
    const entries = await ledgerSum(erin, 'u-erin');
    const paid = entries
      ?.filter((entry) => entry.kind === 'WITHDRAWAL')
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    expect(paid).toBe(-5000);
  });

  test('the GraphQL counterpart answers once and refuses nine: one conditional update', async () => {
    await reset();
    const answers = await Promise.all(
      TEN.map((amount) =>
        query(WITHDRAW, { token: erin, variables: { amount } }),
      ),
    );

    const answered = answers.filter((answer) => answer.errors === undefined);
    const refused = answers.filter((answer) => answer.errors !== undefined);
    expect(answered).toHaveLength(1);
    expect(refused).toHaveLength(9);
    expect(new Set(refused.map((answer) => errorCode(answer)))).toEqual(
      new Set(['CONFLICT']),
    );
    expect(await walletOf(erin, 'USD')).toBe('0.00');
    const entries = await ledgerSum(erin, 'u-erin');
    expect(
      entries?.filter((entry) => entry.kind === 'WITHDRAWAL'),
    ).toHaveLength(1);
  });

  test('the REST counterpart answers once and refuses nine: one transaction, FOR UPDATE', async () => {
    await reset();
    const answers = await Promise.all(
      TEN.map((amount) =>
        call('/internal/wallets/withdraw', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${erin}`,
          },
          body: JSON.stringify({ amount }),
        }),
      ),
    );

    const statuses = answers.map((answer) => answer.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 400)).toHaveLength(9);
    expect(await walletOf(erin, 'USD')).toBe('0.00');
    const entries = await ledgerSum(erin, 'u-erin');
    expect(
      entries?.filter((entry) => entry.kind === 'WITHDRAWAL'),
    ).toHaveLength(1);
  });
});

describe('LOGIC-003 — quickBuy takes the caller\u2019s price', () => {
  const PAYLOAD = { symbol: 'BTC-USD', quantity: '0.00010000', price: '0.01' };
  const QUICK =
    'mutation($symbol: String!, $quantity: Decimal!, $price: Decimal!) { quickBuy(symbol: $symbol, quantity: $quantity, price: $price) { id status limitPrice quantity } }';
  const PLACE =
    'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { id quantity } }';
  const MARKET =
    'mutation($symbol: String!, $quantity: Decimal!) { buyAtMarket(symbol: $symbol, quantity: $quantity) { id status limitPrice } }';

  beforeEach(reset);

  test('a ten-thousandth of a bitcoin is bought for nothing', async () => {
    const answer = await query(QUICK, { token: alice, variables: PAYLOAD });

    // Alice gained the coin for 0.00: a hundredth of a cent rounds to no cents at all.
    expect(answer.errors).toBeUndefined();
    expect(answer.data?.quickBuy).toMatchObject({
      status: 'FILLED',
      limitPrice: '0.01',
      quantity: '0.00010000',
    });
    expect(await walletOf(alice, 'BTC')).toBe('0.00010000');
    expect(await walletOf(alice, 'USD')).toBe('10000.00');
  });

  test('the placeOrder counterpart: no price field exists to send', async () => {
    const answer = await query(PLACE, {
      token: alice,
      variables: {
        input: {
          symbol: PAYLOAD.symbol,
          side: 'BUY',
          type: 'MARKET',
          quantity: PAYLOAD.quantity,
          price: PAYLOAD.price,
        },
      },
    });

    expect(errorCode(answer)).toBe('BAD_USER_INPUT');
    expect(answer.errors?.[0]?.message).toContain('is not defined by type');
  });

  test('the buyAtMarket counterpart charges the server\u2019s price: 6.50', async () => {
    const answer = await query(MARKET, {
      token: alice,
      variables: { symbol: PAYLOAD.symbol, quantity: PAYLOAD.quantity },
    });

    expect(answer.errors).toBeUndefined();
    expect(await walletOf(alice, 'BTC')).toBe('0.00010000');
    expect(await walletOf(alice, 'USD')).toBe('9993.50');
  });
});

describe('LOGIC-004 — convert does money in floating point', () => {
  const PAYLOAD = { asset: 'USD', amount: '8.2' };

  test('eight dollars twenty becomes eight nineteen', async () => {
    const answer = await query(
      'query($asset: Asset!, $amount: Float!) { convert(asset: $asset, amount: $amount) }',
      { token: alice, variables: { asset: 'USD', amount: 8.2 } },
    );

    // A minor unit was gained by whoever holds the difference: the float fell one cent short.
    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({ convert: '8.19' });
  });

  test('the convertExact counterpart: a decimal library, half up, 8.20', async () => {
    const answer = await query(
      'mutation($asset: Asset!, $amount: Decimal!) { convertExact(asset: $asset, amount: $amount) }',
      { token: alice, variables: PAYLOAD },
    );

    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({ convertExact: '8.20' });
  });

  test('the placeOrder counterpart carries 8.2 as integer minor units', async () => {
    const answer = await query(
      'mutation($input: PlaceOrderInput!) { placeOrder(input: $input) { quantity } }',
      {
        token: alice,
        variables: {
          input: {
            symbol: 'DOGE-USD',
            side: 'BUY',
            type: 'LIMIT',
            limitPrice: '0.12',
            quantity: PAYLOAD.amount,
          },
        },
      },
    );

    // The decimal string 8.2 became 820000000 minor units and came back at the
    // coin's scale: no float ever held it.
    expect(answer.errors).toBeUndefined();
    expect(answer.data?.placeOrder).toMatchObject({
      quantity: '8.20000000',
    });
  });
});

describe('LOGIC-005 — matchOrder fills an order twice', () => {
  const MATCH =
    'mutation($orderId: ID!) { matchOrder(orderId: $orderId) { id status } }';
  const SETTLE =
    'mutation($orderId: ID!, $tickId: ID!) { settleOrder(orderId: $orderId, tickId: $tickId) { id status } }';

  test('two parallel matchOrder calls credit half a bitcoin twice', async () => {
    await reset();
    const before = await tradesOfOrder1();
    const answers = await Promise.all([
      query(MATCH, { token: admin, variables: { orderId: '1' } }),
      query(MATCH, { token: admin, variables: { orderId: '1' } }),
    ]);

    // Alice's order 1 buys 0.5 BTC; both calls saw it OPEN, so 1.0 BTC was credited.
    expect(
      answers.filter((answer) => answer.errors === undefined),
    ).toHaveLength(2);
    expect(await walletOf(alice, 'BTC')).toBe('1.00000000');
    expect((await tradesOfOrder1()).length - before.length).toBe(2);
  });

  test('the tickPrices counterpart, twice in parallel: filled once, one trade', async () => {
    await reset();
    const before = await tradesOfOrder1();
    const ticks = await Promise.all([
      query('mutation { tickPrices { symbol referencePrice } }', {
        token: admin,
      }),
      query('mutation { tickPrices { symbol referencePrice } }', {
        token: admin,
      }),
    ]);

    expect(ticks.filter((tick) => tick.errors === undefined)).toHaveLength(2);
    // The first tick moves BTC-USD to 63700.00, which crosses Alice's 64000.00 buy.
    expect(await walletOf(alice, 'BTC')).toBe('0.50000000');
    const order = await query(
      'query($id: ID!) { orderDetails(id: $id) { id status } }',
      { token: alice, variables: { id: '1' } },
    );
    expect(order.data).toEqual({
      orderDetails: { id: '1', status: 'FILLED' },
    });
    expect((await tradesOfOrder1()).length - before.length).toBe(1);
  });

  test('the settleOrder counterpart, the same tick twice: one trade, the unique key', async () => {
    await reset();
    const before = await tradesOfOrder1();
    const first = await query(SETTLE, {
      token: admin,
      variables: { orderId: '1', tickId: 'tick-scenario-5' },
    });
    const second = await query(SETTLE, {
      token: admin,
      variables: { orderId: '1', tickId: 'tick-scenario-5' },
    });

    expect(first.errors).toBeUndefined();
    expect(second.errors).toBeUndefined();
    expect(await walletOf(alice, 'BTC')).toBe('0.50000000');
    expect((await tradesOfOrder1()).length - before.length).toBe(1);
  });
});

/** The trades order 1 has, seed included: the baseline the fill counts are read against. */
async function tradesOfOrder1(): Promise<Array<{ orderId: string }>> {
  const trades = await query(
    'query($symbol: String!) { trades(symbol: $symbol, limit: 200) { orderId } }',
    { variables: { symbol: 'BTC-USD' } },
  );
  return (trades.data?.trades as Array<{ orderId: string }>).filter(
    (trade) => trade.orderId === '1',
  );
}
