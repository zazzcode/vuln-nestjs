import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  request,
  runSecret,
  sessionToken,
  startService,
  type GraphQLResponse,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../src/app.module.js';

// GQL-007, the counterpart, in this subgraph alone. The federation queries
// `_service` and `_entities` are answered only to a caller presenting the
// internal service token, which the gateway does on every fetch. The flaw
// itself is accounts': there, the same two queries answer any caller. This
// file proves them refused here, in both directions: what is refused, and
// that the gateway's own call is not.
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
const admin = tokenOf('u-admin', 'ADMIN');

/** One operation, with the headers given and nothing the helper would add: the status is what is asserted. */
const post = async (
  query: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: GraphQLResponse }> => {
  const response = await request(`${service.url}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query }),
  });
  return {
    status: response.status,
    body: (await response.json()) as GraphQLResponse,
  };
};

const SERVICE = '{ _service { sdl } }';
const ENTITIES =
  '{ _entities(representations: [{__typename: "Order", id: "1"}]) { ... on Order { id } } }';
// The same two queries, selected where a search of the query text would not look.
const HIDDEN =
  '{ ...on Query { anything: _entities(representations: [{__typename: "Order", id: "1"}]) { ... on Order { id } } } sdl: _service { sdl } }';

const REFUSAL = 'trading answers its federation queries to the gateway only';

/** What the counterpart answers a caller that is not the gateway: 403, the lab's code for it, and no data. */
function expectRefused(answer: { status: number; body: GraphQLResponse }) {
  expect(answer.status).toBe(403);
  expect(answer.body.data).toBeUndefined();
  expect(answer.body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  expect(answer.body.errors?.[0]?.message).toBe(REFUSAL);
}

describe("GQL-007, the counterpart: this subgraph's federation queries answer only to the gateway", () => {
  test('_service and _entities answer 403 to a call with no credential', async () => {
    for (const query of [SERVICE, ENTITIES]) {
      expectRefused(await post(query));
    }
  });

  // A session token says who the caller is; it does not say the caller is the gateway.
  test('and to a call with a session token and no service token, a plain user or an administrator', async () => {
    for (const token of [alice, admin]) {
      for (const query of [SERVICE, ENTITIES]) {
        expectRefused(await post(query, { authorization: `Bearer ${token}` }));
      }
    }
  });

  test('and where the query hides _entities under an alias and a fragment', async () => {
    expectRefused(await post(HIDDEN));
  });

  // The gateway's own call: the token is presented, and the query is answered.
  test('with the service token, both are answered', async () => {
    const schema = await post(SERVICE, {
      'x-internal-token': SERVICE_TOKEN,
    });
    expect(schema.status).toBe(200);
    expect(schema.body.errors).toBeUndefined();
    expect(schema.body.data?._service).toMatchObject({
      sdl: expect.stringContaining('type Order @key(fields: "id")'),
    });

    const reference = await post(ENTITIES, {
      'x-internal-token': SERVICE_TOKEN,
      authorization: `Bearer ${alice}`,
    });
    expect(reference.status).toBe(200);
    expect(reference.body.errors).toBeUndefined();
    expect(reference.body.data?._entities).toEqual([{ id: '1' }]);
  });

  // The plugin asks only about the two federation queries. Everything else answers as it did.
  test('an operation that is neither is answered as before', async () => {
    const markets = await post('{ markets { symbol } }');
    expect(markets.status).toBe(200);
    expect(markets.body.errors).toBeUndefined();
    expect(markets.body.data?.markets).toEqual([
      { symbol: 'BTC-USD' },
      { symbol: 'DOGE-USD' },
      { symbol: 'ETH-USD' },
      { symbol: 'SOL-USD' },
      { symbol: 'XRP-USD' },
    ]);

    const orders = await post('{ orders { id userId } }', {
      authorization: `Bearer ${alice}`,
    });
    expect(orders.status).toBe(200);
    expect(orders.body.errors).toBeUndefined();
    expect(orders.body.data?.orders).toEqual([
      { id: '1', userId: 'u-alice' },
      { id: '6', userId: 'u-alice' },
    ]);
  });
});
