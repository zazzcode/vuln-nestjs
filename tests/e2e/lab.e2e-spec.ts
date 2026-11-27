import { graphql, request, sessionToken } from '@zazzles/exchange-testing';
import { useLab } from './lab.js';

const lab = useLab();
const gateway = () => lab().url;

/** The administrator, who may read any user: a fake user's profile, signed with the secret of this run. */
const administrator = (): string =>
  sessionToken(lab().secrets.JWT_SECRET, {
    sub: 'u-admin',
    sid: 's-admin',
    role: 'ADMIN',
  });

/** What the gateway answers a client who asks each of the three services for its data. */
const snapshot = () =>
  graphql(
    `${gateway()}/graphql`,
    '{ user(id: "u-alice") { displayName orders { id symbol } } announcements { id title } }',
    {
      token: administrator(),
    },
  );

const FAKE_DATA = {
  data: {
    user: { displayName: 'Alice', orders: [{ id: '1', symbol: 'BTC-USD' }] },
    announcements: [{ id: '1', title: 'Welcome to VCX' }],
  },
};

describe('the lab endpoints of the gateway', () => {
  // The exact shape: nothing in it names a version or holds an environment value.
  test('health answers with one entry per service and its store, and nothing else', async () => {
    const response = await fetch(`${gateway()}/api/v1/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      services: {
        accounts: {
          status: 'ok',
          service: 'accounts',
          store: { engine: 'mongodb', connected: true },
        },
        trading: {
          status: 'ok',
          service: 'trading',
          store: { engine: 'mysql', connected: true },
        },
        notifications: {
          status: 'ok',
          service: 'notifications',
          store: { engine: 'sqlite', connected: true },
        },
      },
    });
  });

  test('the lab starts with the fake data in every store', async () => {
    expect(await snapshot()).toEqual(FAKE_DATA);
  });

  // That reset restores what a change damaged is proven where a change can be made, in each service's own tests,
  // which reach into the store: a changed document, a changed row and a dropped table all come back.
  test('reset answers with one status per service, and every store holds the fake data afterwards', async () => {
    const reset = await fetch(`${gateway()}/api/v1/lab/reset`, {
      method: 'POST',
    });

    expect(reset.status).toBe(200);
    expect(await reset.json()).toEqual({
      accounts: 'ok',
      trading: 'ok',
      notifications: 'ok',
    });
    expect(await snapshot()).toEqual(FAKE_DATA);
  });

  test('reset is lab tooling: it answers with no token, as often as asked', async () => {
    const reset = () =>
      fetch(`${gateway()}/api/v1/lab/reset`, { method: 'POST' });

    expect((await reset()).status).toBe(200);
    expect(await (await reset()).json()).toEqual({
      accounts: 'ok',
      trading: 'ok',
      notifications: 'ok',
    });
  });

  // The gateway does not invent its report: each entry is what that service says about itself.
  test('each entry of health is what that service says about itself on its own listener', async () => {
    const reported = (await fetch(`${gateway()}/api/v1/health`).then(
      (response) => response.json(),
    )) as {
      services: Record<'accounts' | 'trading' | 'notifications', unknown>;
    };

    for (const [service, state] of Object.entries(reported.services)) {
      // The helper speaks to each service over the transport its listener speaks.
      const own = await request(
        `${lab().serviceUrl(service as keyof typeof reported.services)}/internal/health`,
      ).then((response) => response.json());

      expect(own).toEqual(state);
    }
  });
});
