import { ExpressAdapter } from '@nestjs/platform-express';
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

// Authorization: every admin operation refuses a user and no token; every
// own-data operation refuses another user's object. AC9, each case by name.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;

const admin = () =>
  sessionToken(JWT_SECRET, { sub: 'u-admin', sid: 's', role: 'ADMIN' });
const alice = () =>
  sessionToken(JWT_SECRET, { sub: 'u-alice', sid: 's', role: 'USER' });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startService({
    module: AppModule,
    adapter: () => new ExpressAdapter(),
    port: 3103,
  });
}, 300_000);

afterAll(async () => {
  await service?.stop();
});

const query = (
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
) => graphql(`${service.url}/graphql`, source, options);

describe('the administrator operations refuse a user and no token', () => {
  test('evaluateAlerts', async () => {
    const prices = { prices: [{ symbol: 'BTC-USD', price: '71000.00' }] };
    expect(
      errorCode(
        await query(
          'mutation($prices: [PriceInput!]!) { evaluateAlerts(prices: $prices) { id } }',
          {
            token: alice(),
            variables: prices,
          },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query(
          'mutation($prices: [PriceInput!]!) { evaluateAlerts(prices: $prices) { id } }',
          {
            variables: prices,
          },
        ),
      ),
    ).toBe('UNAUTHENTICATED');
  });

  test('broadcastAnnouncement', async () => {
    const input = { input: { title: 'T', body: 'B' } };
    expect(
      errorCode(
        await query(
          'mutation($input: AnnouncementInput!) { broadcastAnnouncement(input: $input) { id } }',
          {
            token: alice(),
            variables: input,
          },
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query(
          'mutation($input: AnnouncementInput!) { broadcastAnnouncement(input: $input) { id } }',
          {
            variables: input,
          },
        ),
      ),
    ).toBe('UNAUTHENTICATED');
  });

  test('POST /internal/announcements/notify', async () => {
    const body = JSON.stringify({ title: 'T', body: 'B' });
    const call = (token: string | undefined) =>
      request(`${service.url}/internal/announcements/notify`, {
        method: 'POST',
        headers: {
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
          'content-type': 'application/json',
        },
        body,
      });

    expect((await call(alice())).status).toBe(403);
    expect((await call(undefined)).status).toBe(401);
  });
});

describe('the own-data operations', () => {
  test("deleteAlert refuses another user's alert with FORBIDDEN and an unknown one with NOT_FOUND", async () => {
    expect(
      errorCode(
        await query('mutation($id: ID!) { deleteAlert(id: $id) { id } }', {
          token: alice(),
          variables: { id: '2' },
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await query('mutation($id: ID!) { deleteAlert(id: $id) { id } }', {
          token: alice(),
          variables: { id: '999' },
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  test.each([
    ['alerts', 'alerts { id }'],
    ['webhookUrl', 'webhookUrl'],
    ['notificationSettings', 'notificationSettings'],
  ])(
    "User.%s answers the caller's own user and an administrator, refuses another user and no token",
    async (_field, selection) => {
      const source = `query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { ${selection} } } }`;
      const representations = [{ __typename: 'User', id: 'u-bob' }];

      expect(
        (
          await query(source, {
            token: alice(),
            variables: { representations },
          })
        ).errors?.[0]?.extensions?.code,
      ).toBe('FORBIDDEN');
      expect(
        (await query(source, { variables: { representations } })).errors?.[0]
          ?.extensions?.code,
      ).toBe('UNAUTHENTICATED');

      const own = await query(
        `query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { ${selection} } } }`,
        {
          token: alice(),
          variables: {
            representations: [{ __typename: 'User', id: 'u-alice' }],
          },
        },
      );
      expect(own.errors).toBeUndefined();

      const asAdmin = await query(source, {
        token: admin(),
        variables: { representations },
      });
      expect(asAdmin.errors).toBeUndefined();
    },
  );

  test('GET /internal/announcements/:id and :id/page answer with no token', async () => {
    expect(
      (await request(`${service.url}/internal/announcements/1`)).status,
    ).toBe(200);
    expect(
      (await request(`${service.url}/internal/announcements/1/page`)).status,
    ).toBe(200);
  });

  test('GET /internal/deliveries refuses no token', async () => {
    expect((await request(`${service.url}/internal/deliveries`)).status).toBe(
      401,
    );
  });
});
