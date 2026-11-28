import {
  errorCode,
  graphql,
  request,
  sessionToken,
  type GraphQLResponse,
} from '@zazzles/exchange-testing';
import { useLab } from './lab.js';

// The GraphQL scenarios of the gateway (GQL-001 to GQL-004), and the one
// deployment-level setting the gateway shares with its subgraphs (GQL-007),
// against the real lab: the gateway and the three services, no stand-in.
const lab = useLab();

/** A session token for one of the fake users, signed with the secret of this run. */
const tokenOf = (sub: string, role: 'ADMIN' | 'USER' = 'USER'): string =>
  sessionToken(lab().secrets.JWT_SECRET, { sub, sid: `s-${sub}`, role });

const query = (source: string, token?: string) =>
  graphql(`${lab().url}/graphql`, source, { token });

type Subgraph = 'accounts' | 'trading' | 'notifications';

/**
 * One operation posted straight to a subgraph: to its own listener, or
 * through the relay in front of it where it has one. Nothing is added to the
 * headers given, because the status and the refusal are what is asserted.
 */
const post = async (
  service: Subgraph,
  source: string,
  headers: Record<string, string> = {},
  throughTheRelay = false,
): Promise<{ status: number; body: GraphQLResponse }> => {
  const base = throughTheRelay
    ? lab().http1Url(service)
    : lab().serviceUrl(service);
  const response = await request(`${base}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query: source }),
  });
  return {
    status: response.status,
    body: (await response.json()) as GraphQLResponse,
  };
};

/**
 * One POST to the gateway's own GraphQL endpoint, carrying the HTTP status of
 * the answer: a batched call answers an array, so the body is parsed and left
 * for each test to read as what it sent.
 */
const call = async (
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> => {
  const response = await request(`${lab().url}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
};

// GQL-001 to GQL-004 are process-wide settings of the gateway's graph. Each
// test asserts the exploit; the hardened value is named beside it, because a
// setting has no protected twin to send the same payload to.

// GQL-001 — introspection, and the IDE, served to anyone. Hardened value:
// `introspection: false` and `graphiql: false`, in the factory's `server:` block.
describe('GQL-001 — introspection and the IDE, served to anyone', () => {
  test('GQL-001: a caller with no token reads the whole graph from __schema', async () => {
    const answer = await call({
      query: '{ __schema { queryType { name } types { name } } __typename }',
    });

    expect(answer.status).toBe(200);
    const body = answer.body as GraphQLResponse;
    expect(body.errors).toBeUndefined();
    const names: string[] = (
      body.data as { __schema: { types: { name: string }[] } }
    ).__schema.types.map((type) => type.name);
    // What was gained: the whole composed graph — every type of the three real
    // services, its entities and its fields, with no credential at all.
    expect(names).toEqual(
      expect.arrayContaining(['User', 'Order', 'Market', 'Announcement']),
    );
  });

  test('GQL-001: a browser that opens the endpoint is served the GraphiQL IDE', async () => {
    const response = await request(`${lab().url}/graphql`, {
      headers: { accept: 'text/html' },
    });
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    // What was gained: the IDE itself, served by the running lab, ready to run
    // queries against the graph it composed from the three services.
    expect(page).toContain('<title>GraphiQL</title>');
  });
});

describe('GQL-007 — the backend federation queries answer any caller', () => {
  const SCHEMA = '{ _service { sdl } }';
  const ADMINISTRATOR_BY_KEY =
    '{ _entities(representations: [{__typename: "User", id: "u-admin"}]) { ... on User { id email displayName } } }';
  const ANNOUNCEMENT_BY_KEY =
    '{ _entities(representations: [{__typename: "Announcement", id: "1"}]) { ... on Announcement { id title } } }';
  const ORDER_BY_KEY =
    '{ _entities(representations: [{__typename: "Order", id: "1"}]) { ... on Order { id userId symbol } } }';

  /** What the hardened subgraph answers a caller without its token. */
  const expectRefusedByTrading = (answer: {
    status: number;
    body: GraphQLResponse;
  }) => {
    expect(answer.status).toBe(403);
    expect(answer.body.data).toBeUndefined();
    expect(answer.body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(answer.body.errors?.[0]?.message).toBe(
      'trading answers its federation queries to the gateway only',
    );
  };

  test('GQL-007: a direct _entities call to accounts with no token reads any user by key', async () => {
    const read = await post('accounts', ADMINISTRATOR_BY_KEY);

    expect(read.status).toBe(200);
    // What was gained: the administrator's own record, by key, with no
    // credential at all — through the query the gateway alone is meant to use.
    expect(read.body.data?._entities).toEqual([
      { id: 'u-admin', email: 'admin@vcx.exchange', displayName: 'Admin' },
    ]);

    // And the schema itself, from the same listener.
    const schema = await post('accounts', SCHEMA);
    expect(schema.status).toBe(200);
    expect(schema.body.data?._service).toMatchObject({
      sdl: expect.stringContaining('type User @key(fields: "id")'),
    });

    // The same service refuses the same record to the guarded field: `user(id)`
    // is an administrator's question, and a plain user is not one either.
    expect(
      errorCode(
        (await post('accounts', '{ user(id: "u-admin") { id } }')).body,
      ),
    ).toBe('UNAUTHENTICATED');
    expect(
      errorCode(
        (
          await post('accounts', '{ user(id: "u-admin") { id } }', {
            authorization: `Bearer ${tokenOf('u-alice')}`,
          })
        ).body,
      ),
    ).toBe('FORBIDDEN');
  });

  // The same weak setting, in the third subgraph: its queries are open too.
  test('GQL-007: notifications answers the same two queries to a caller with no token', async () => {
    const read = await post('notifications', ANNOUNCEMENT_BY_KEY);
    expect(read.status).toBe(200);
    expect(read.body.data?._entities).toEqual([
      { id: '1', title: 'Welcome to VCX' },
    ]);

    const schema = await post('notifications', SCHEMA);
    expect(schema.status).toBe(200);
    expect(schema.body.data?._service).toMatchObject({
      sdl: expect.stringContaining('type Announcement @key(fields: "id")'),
    });
  });

  // Why refused: trading requires the internal service token on its federation
  // queries, and this call presents none.
  test('GQL-007: the same call to trading, with no credential, is refused with 403', async () => {
    expectRefusedByTrading(await post('trading', ORDER_BY_KEY));
    expectRefusedByTrading(await post('trading', SCHEMA));
  });

  // A session token says who the caller is; it does not say the caller is the gateway.
  test('GQL-007: a session token does not make a caller the gateway: trading still answers 403', async () => {
    for (const token of [tokenOf('u-alice'), tokenOf('u-admin', 'ADMIN')]) {
      expectRefusedByTrading(
        await post('trading', ORDER_BY_KEY, {
          authorization: `Bearer ${token}`,
        }),
      );
      expectRefusedByTrading(
        await post('trading', SCHEMA, { authorization: `Bearer ${token}` }),
      );
    }
  });

  // The gateway's own call: the token is presented, and the query is answered.
  test('GQL-007: the gateway, which presents the token on every fetch, is answered — and so is the graph', async () => {
    const asTheGateway = {
      'x-internal-token': lab().secrets.INTERNAL_SERVICE_TOKEN,
    };
    const schema = await post('trading', SCHEMA, asTheGateway);
    expect(schema.status).toBe(200);
    expect(schema.body.errors).toBeUndefined();
    expect(schema.body.data?._service).toMatchObject({
      sdl: expect.stringContaining('type Order @key(fields: "id")'),
    });

    // The joins that are themselves _entities calls: trading's orders with the
    // user each one references, which accounts answers; the other way round, an
    // _entities call to trading; and a field of each of the three services.
    const alice = tokenOf('u-alice');
    const orders = await query(
      '{ orders { id symbol user { id email displayName } } }',
      alice,
    );
    expect(orders.errors).toBeUndefined();
    expect(orders.data).toEqual({
      orders: [
        {
          id: '1',
          symbol: 'BTC-USD',
          user: {
            id: 'u-alice',
            email: 'alice@vcx.exchange',
            displayName: 'Alice',
          },
        },
        {
          id: '6',
          symbol: 'SOL-USD',
          user: {
            id: 'u-alice',
            email: 'alice@vcx.exchange',
            displayName: 'Alice',
          },
        },
      ],
    });

    const user = await query(
      '{ user(id: "u-alice") { id email orders { id symbol } } }',
      tokenOf('u-admin', 'ADMIN'),
    );
    expect(user.errors).toBeUndefined();
    expect(user.data).toEqual({
      user: {
        id: 'u-alice',
        email: 'alice@vcx.exchange',
        orders: [
          { id: '1', symbol: 'BTC-USD' },
          { id: '6', symbol: 'SOL-USD' },
        ],
      },
    });

    const allThree = await query(
      '{ orders { id symbol user { displayName } } announcements { id title } }',
      alice,
    );
    expect(allThree.errors).toBeUndefined();
    expect(allThree.data).toMatchObject({
      orders: [{ id: '1' }, { id: '6' }],
      announcements: [{ id: '1', title: 'Welcome to VCX' }],
    });
  });

  // The plugin asks only about the two federation queries: trading's ordinary operations answer as before.
  test('GQL-007: an operation of trading that is neither federation query is answered as before', async () => {
    const markets = await post('trading', '{ markets { symbol } }');
    expect(markets.status).toBe(200);
    expect(markets.body.errors).toBeUndefined();
    expect(markets.body.data?.markets).toHaveLength(5);

    const orders = await post('trading', '{ orders { id userId } }', {
      authorization: `Bearer ${tokenOf('u-alice')}`,
    });
    expect(orders.status).toBe(200);
    expect(orders.body.errors).toBeUndefined();
    expect(orders.body.data?.orders).toEqual([
      { id: '1', userId: 'u-alice' },
      { id: '6', userId: 'u-alice' },
    ]);
  });

  // A tool on HTTP/1.1 reaches trading through the relay, and meets the same question.
  test('GQL-007: through the relay in front of trading, the same answers', async () => {
    expectRefusedByTrading(await post('trading', SCHEMA, {}, true));

    const answered = await post(
      'trading',
      SCHEMA,
      { 'x-internal-token': lab().secrets.INTERNAL_SERVICE_TOKEN },
      true,
    );
    expect(answered.status).toBe(200);
    expect(answered.body.data?._service).toMatchObject({
      sdl: expect.any(String),
    });
  });
});
