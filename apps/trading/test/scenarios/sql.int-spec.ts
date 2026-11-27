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

// The SQL family: seven ways a template literal came to be taken for a prepared
// statement. One payload per scenario, sent to the vulnerable operation and to
// each protected counterpart.
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
  options: { token?: string; variables?: Record<string, unknown> } = {},
) => graphql(`${service.url}/graphql`, source, options);

const reset = () =>
  request(`${service.url}/internal/lab/reset`, {
    method: 'POST',
    headers: { 'x-internal-token': SERVICE_TOKEN },
  });

describe('SQL-001 — orderLookup: an untagged template literal', () => {
  const PAYLOAD = { id: '1 OR 1=1' };
  const LOOKUP =
    'query($id: String!) { orderLookup(id: $id) { id userId symbol } }';
  const BY_ID = 'query($id: ID!) { order(id: $id) { id userId symbol } }';
  const BY_REFERENCE =
    'query($ref: String!) { orderByReference(ref: $ref) { id userId symbol } }';

  test('the payload reads an order that is not an id at all', async () => {
    const answer = await query(LOOKUP, { token: bob, variables: PAYLOAD });

    // Bob gained Alice's order: "1 OR 1=1" is not an identifier, and the query answered as though it were.
    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({
      orderLookup: { id: '1', userId: 'u-alice', symbol: 'BTC-USD' },
    });
  });

  test('the repository counterpart refuses it: not a whole number', async () => {
    expect(
      errorCode(await query(BY_ID, { token: bob, variables: PAYLOAD })),
    ).toBe('BAD_USER_INPUT');
  });

  test('the raw-SQL counterpart binds it: no such reference', async () => {
    expect(
      errorCode(
        await query(BY_REFERENCE, {
          token: bob,
          variables: { ref: PAYLOAD.id },
        }),
      ),
    ).toBe('NOT_FOUND');
  });
});

describe('SQL-002 — tradeHistory: a where built by concatenation', () => {
  const PAYLOAD = {
    input: { symbol: "BTC-USD' OR '1'='1", side: 'BUY' },
  };
  const HISTORY =
    'query($input: TradeHistoryInput!) { tradeHistory(input: $input) { id symbol side } }';
  const TRADES =
    'query($symbol: String!) { trades(symbol: $symbol) { id symbol side } }';
  const NAMED =
    'query($symbol: String!) { tradesNamed(symbol: $symbol) { id symbol side } }';

  test('the payload returns trades of symbols it never named', async () => {
    const answer = await query(HISTORY, { token: alice, variables: PAYLOAD });

    // Alice gained the whole BUY side and BTC-USD besides: eleven rows for a symbol string
    // that matches no market, across ETH-USD, SOL-USD, XRP-USD and DOGE-USD.
    expect(answer.errors).toBeUndefined();
    const trades = answer.data?.tradeHistory as Array<{
      id: string;
      symbol: string;
    }>;
    expect(trades).toHaveLength(11);
    expect(trades.map((trade) => trade.symbol)).toContain('ETH-USD');
    expect(trades.map((trade) => trade.symbol)).toContain('DOGE-USD');
  });

  test('the object-literal counterpart binds the symbol: nothing matches it', async () => {
    const answer = await query(TRADES, {
      token: alice,
      variables: { symbol: PAYLOAD.input.symbol },
    });

    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({ trades: [] });
  });

  test('the named-parameter counterpart binds the symbol: nothing matches it', async () => {
    const answer = await query(NAMED, {
      token: alice,
      variables: { symbol: PAYLOAD.input.symbol },
    });

    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({ tradesNamed: [] });
  });
});

describe('SQL-003 — searchMarkets: a LIKE pattern concatenated', () => {
  const PAYLOAD = { q: "zzz' OR 1=1 -- " };
  const SEARCH = 'query($q: String!) { searchMarkets(q: $q) { symbol } }';
  const MARKETS = 'query($q: String) { markets(q: $q) { symbol } }';
  const BY_ASSETS =
    'query($assets: [Asset!]!) { marketsByAssets(assets: $assets) { symbol } }';

  test('the payload returns all five markets from a match of none', async () => {
    const answer = await query(SEARCH, { variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({
      searchMarkets: [
        { symbol: 'BTC-USD' },
        { symbol: 'DOGE-USD' },
        { symbol: 'ETH-USD' },
        { symbol: 'SOL-USD' },
        { symbol: 'XRP-USD' },
      ],
    });
  });

  test('the bound counterpart escapes the pattern: no market matches', async () => {
    const answer = await query(MARKETS, { variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({ markets: [] });
  });

  test('the enum-list counterpart: the schema refuses the string as an Asset', async () => {
    const answer = await query(BY_ASSETS, {
      variables: { assets: [PAYLOAD.q] },
    });

    // The value never reached the resolver: the schema itself refused it as an Asset.
    expect(errorCode(answer)).toBe('BAD_USER_INPUT');
    expect(answer.errors?.[0]?.message).toContain('got invalid value');
  });
});

describe('SQL-004 — tradesSorted: a caller-controlled sort column', () => {
  // The sort key multiplies the id by a CASE on Erin's USD balance: above
  // 400.00 it is negative, so an ascending answer comes back by descending id.
  const PAYLOAD = {
    symbol: 'BTC-USD',
    sortBy:
      "id * (SELECT CASE WHEN w.balance > 40000 THEN -1 ELSE 1 END FROM wallets w WHERE w.userId = 'u-erin' AND w.asset = 'USD')",
    sortDir: 'ASC',
  };
  const SORTED =
    'query($symbol: String!, $sortBy: String!, $sortDir: String!) { tradesSorted(symbol: $symbol, sortBy: $sortBy, sortDir: $sortDir) { id } }';
  const TRADES =
    'query($symbol: String!, $orderBy: TradeOrderBy) { trades(symbol: $symbol, orderBy: $orderBy) { id } }';
  const NAMED =
    'query($symbol: String!) { tradesNamed(symbol: $symbol) { id } }';

  test('the order of the answer says Erin\u2019s balance is above 400.00', async () => {
    const answer = await query(SORTED, { variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    // Newest first would be 1, 2, 3; the CASE flipped the key, which happens only above 400.00 (her balance is 500.00).
    expect(answer.data).toEqual({
      tradesSorted: [{ id: '3' }, { id: '2' }, { id: '1' }],
    });
  });

  test('the enum counterpart: the schema refuses the string as a TradeOrderBy', async () => {
    const answer = await query(TRADES, {
      variables: { symbol: PAYLOAD.symbol, orderBy: PAYLOAD.sortBy },
    });

    // The value never reached the resolver: the schema itself refused it as a TradeOrderBy.
    expect(errorCode(answer)).toBe('BAD_USER_INPUT');
    expect(answer.errors?.[0]?.message).toContain('got invalid value');
  });

  test('the fixed-order counterpart has no sort argument, and answers newest first', async () => {
    const answer = await query(NAMED, {
      variables: { symbol: PAYLOAD.symbol },
    });

    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({
      tradesNamed: [{ id: '1' }, { id: '2' }, { id: '3' }],
    });
  });
});

describe('SQL-005 — volumeFor: a tag that escapes quotes and joins', () => {
  const PAYLOAD = { symbol: "\\' OR 1=1 -- " };
  const VOLUME = 'query($symbol: String!) { volumeFor(symbol: $symbol) }';
  const HIGH = 'query($symbol: String!) { highPrice(symbol: $symbol) }';
  const MARKETS = 'query($q: String) { markets(q: $q) { symbol } }';

  test('the payload adds the volume of every market', async () => {
    const answer = await query(VOLUME, { variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    // BTC-USD holds 0.2 BTC of trades; every market together holds 3907.4.
    expect(answer.data).toEqual({ volumeFor: '3907.40000000' });
  });

  test('the sql-tag counterpart binds the symbol: no such market', async () => {
    expect(errorCode(await query(HIGH, { variables: PAYLOAD }))).toBe(
      'NOT_FOUND',
    );
  });

  test('the bound search counterpart: no market matches the text', async () => {
    const answer = await query(MARKETS, { variables: { q: PAYLOAD.symbol } });

    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({ markets: [] });
  });
});

describe('SQL-006 — feesPaid: execute() on an interpolated string', () => {
  const PAYLOAD = { symbol: "' OR '1'='1" };
  const FEES = 'query($symbol: String!) { feesPaid(symbol: $symbol) }';
  const SETTLEMENT =
    'query($symbol: String!) { settlementPrice(symbol: $symbol) }';
  const BY_REFERENCE =
    'query($ref: String!) { orderByReference(ref: $ref) { id } }';

  test('the payload adds every user\u2019s fees', async () => {
    const answer = await query(FEES, { token: alice, variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    // Alice's own fees are 11.15; every user's together are 66.67.
    expect(answer.data).toEqual({ feesPaid: '66.67' });
  });

  test('the prepared-statement counterpart binds the symbol: no such market', async () => {
    expect(errorCode(await query(SETTLEMENT, { variables: PAYLOAD }))).toBe(
      'NOT_FOUND',
    );
  });

  test('the placeholder counterpart binds the reference: no such order', async () => {
    expect(
      errorCode(
        await query(BY_REFERENCE, {
          token: alice,
          variables: { ref: PAYLOAD.symbol },
        }),
      ),
    ).toBe('NOT_FOUND');
  });
});

describe('SQL-007 — ordersByIds: an IN list joined from the ids', () => {
  const PAYLOAD = { ids: ['0) OR (1=1'] };
  const BY_IDS = 'query($ids: [ID!]!) { ordersByIds(ids: $ids) { id userId } }';
  const AMONG = 'query($ids: [ID!]!) { ordersAmong(ids: $ids) { id userId } }';
  const BY_REFERENCE =
    'query($ref: String!) { orderByReference(ref: $ref) { id } }';

  test('the payload returns every user\u2019s orders to Bob', async () => {
    const answer = await query(BY_IDS, { token: bob, variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    const orders = answer.data?.ordersByIds as Array<{
      id: string;
      userId: string;
    }>;
    expect(orders).toHaveLength(10);
    expect(orders.map((order) => order.userId)).toContain('u-alice');
    expect(orders.map((order) => order.userId)).toContain('u-erin');
  });

  test('the In-list counterpart binds the ids and stays scoped to the caller', async () => {
    const answer = await query(AMONG, { token: bob, variables: PAYLOAD });

    expect(answer.errors).toBeUndefined();
    expect(answer.data).toEqual({ ordersAmong: [] });
  });

  test('the placeholder counterpart binds the reference: no such order', async () => {
    expect(
      errorCode(
        await query(BY_REFERENCE, {
          token: bob,
          variables: { ref: PAYLOAD.ids[0] },
        }),
      ),
    ).toBe('NOT_FOUND');
  });
});

// The scenarios change no money, but the last one is a good place to prove the
// store still resets: the family runs against the fake data throughout.
afterEach(async () => {
  await reset();
});
