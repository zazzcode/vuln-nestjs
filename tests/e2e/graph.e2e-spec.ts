import { errorCode, graphql, sessionToken } from '@zazzles/exchange-testing';
import { useLab } from './lab.js';

const lab = useLab();

describe('the graph the gateway composes from the three subgraphs', () => {
  /** A session token for one of the fake users, signed with the secret of this run. */
  const tokenOf = (sub: string, role: 'ADMIN' | 'USER' = 'USER'): string =>
    sessionToken(lab().secrets.JWT_SECRET, { sub, sid: `s-${sub}`, role });

  const query = (source: string, token?: string) =>
    graphql(`${lab().url}/graphql`, source, { token });

  test('answers, in one query, fields that three different services own', async () => {
    // orders is trading's; the order's user is a reference to accounts'; announcements is notifications'.
    const response = await query(
      '{ orders { id symbol limitPrice quantity user { id email displayName } } announcements { id title } }',
      tokenOf('u-alice'),
    );

    expect(response.errors).toBeUndefined();
    expect(response.data).toEqual({
      orders: [
        {
          id: '1',
          symbol: 'BTC-USD',
          limitPrice: '64000.00',
          quantity: '0.50000000',
          // Sent by trading as a reference carrying the key; the email and the name come from accounts.
          user: {
            id: 'u-alice',
            email: 'alice@zazzles.exchange',
            displayName: 'Alice',
          },
        },
      ],
      announcements: [{ id: '1', title: 'Welcome to Zazzles Exchange' }],
    });
  });

  test('joins a user that accounts owns with the orders that trading adds to it', async () => {
    const response = await query(
      '{ user(id: "u-alice") { id email orders { id symbol } } }',
      tokenOf('u-admin', 'ADMIN'),
    );

    expect(response.errors).toBeUndefined();
    expect(response.data).toEqual({
      user: {
        id: 'u-alice',
        email: 'alice@zazzles.exchange',
        orders: [{ id: '1', symbol: 'BTC-USD' }],
      },
    });
  });

  // The token travels with the request to whichever service owns the field, and that service judges it.
  test('forwards the caller to the service that owns each field', async () => {
    expect(errorCode(await query('{ orders { id } }'))).toBe('UNAUTHENTICATED');

    const bob = await query('{ orders { id userId } }', tokenOf('u-bob'));

    expect(bob.data).toEqual({ orders: [{ id: '2', userId: 'u-bob' }] });
  });

  test("carries a service's own refusal through, with its code", async () => {
    // A user asking accounts for another user: accounts refuses, and the gateway passes the refusal on.
    expect(
      errorCode(
        await query('{ user(id: "u-bob") { id } }', tokenOf('u-alice')),
      ),
    ).toBe('FORBIDDEN');
  });

  test('reports a service that is not running as unavailable, by name, in the error and in health', async () => {
    // The one test in this file that takes the lab apart, so it runs last.
    await lab().stopService('notifications');

    const response = await query('{ announcements { id } }');
    const health = await fetch(`${lab().url}/api/v1/health`);

    expect(errorCode(response)).toBe('SERVICE_UNAVAILABLE');
    expect(response.errors?.[0]?.message).toMatch(/notifications/);
    expect(health.status).toBe(503);
    expect(await health.json()).toMatchObject({
      status: 'unavailable',
      services: {
        accounts: { status: 'ok' },
        trading: { status: 'ok' },
        notifications: { status: 'unavailable', service: 'notifications' },
      },
    });
  });
});
