import { Logger } from '@nestjs/common';
import {
  errorCode,
  graphql,
  request,
  runSecret,
  sessionToken,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { startNotificationsService } from './support/service.js';
import { AlertsRepository } from '../src/alerts/alerts.repository.js';
import { WebhookReceiver } from './support/receiver.js';

// The functional baseline: every safe operation does what its row says. The
// service runs alone; the receiver on 4010 is the only other listener.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;
let receiver: WebhookReceiver;
let alerts: AlertsRepository;

const admin = () =>
  sessionToken(JWT_SECRET, { sub: 'u-admin', sid: 's', role: 'ADMIN' });
const alice = () =>
  sessionToken(JWT_SECRET, { sub: 'u-alice', sid: 's', role: 'USER' });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startNotificationsService();
  alerts = service.app.get(AlertsRepository);
  receiver = WebhookReceiver.forSecret(JWT_SECRET);
  await receiver.listen();
}, 300_000);

afterAll(async () => {
  await receiver?.close();
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

describe('a crossed alert produces one signed delivery', () => {
  const evaluate = (
    token: string,
    prices: { symbol: string; price: string }[],
  ) =>
    query(
      'mutation($prices: [PriceInput!]!) { evaluateAlerts(prices: $prices) { id alertId url status attempts lastError deliveredAt } }',
      { token, variables: { prices } },
    );

  test.each([
    ['above its threshold', [{ symbol: 'BTC-USD', price: '71000.00' }]],
    [
      'above by one unit of the eighth decimal place',
      [{ symbol: 'BTC-USD', price: '70000.00000001' }],
    ],
  ])(
    'delivers for the alert of the user whose price crossed (%s)',
    async (_kind, prices) => {
      await reset();
      receiver.reset();

      const response = await evaluate(admin(), prices);

      expect(response.errors).toBeUndefined();
      expect(response.data).toEqual({
        evaluateAlerts: [
          expect.objectContaining({
            alertId: '1',
            url: 'http://127.0.0.1:4010/webhook/alice',
            status: 'DELIVERED',
            attempts: 1,
            lastError: null,
          }),
        ],
      });

      const seen = receiver.requestsTo('/webhook/alice');
      expect(seen).toHaveLength(1);
      expect(seen[0]!.method).toBe('POST');
      expect(seen[0]!.signatureVerified).toBe(true);
      expect(seen[0]!.headers['content-type']).toBe('application/json');
      expect(JSON.parse(seen[0]!.rawBody)).toEqual({
        alert: {
          id: 1,
          symbol: 'BTC-USD',
          direction: 'ABOVE',
          threshold: '70000.00',
          label: 'Take profit',
        },
        price: prices[0]!.price,
      });
    },
  );

  test('produces nothing for a price that does not cross, an alert that is disabled, or a symbol that is absent', async () => {
    await reset();
    receiver.reset();

    const equal = await evaluate(admin(), [
      { symbol: 'BTC-USD', price: '70000.00' },
    ]);
    expect(equal.data).toEqual({ evaluateAlerts: [] });

    // A price that would cross Bob's and Erin's alerts, with those symbols absent.
    const absent = await evaluate(admin(), [
      { symbol: 'BTC-USD', price: '70000.00' },
    ]);
    expect(absent.data).toEqual({ evaluateAlerts: [] });

    const disabled = await alerts.findById(1);
    expect(disabled).not.toBeNull();
    await alerts.save({ id: 1, enabled: false });
    const crossed = await evaluate(admin(), [
      { symbol: 'BTC-USD', price: '71000.00' },
    ]);
    expect(crossed.data).toEqual({ evaluateAlerts: [] });

    expect(receiver.requests()).toHaveLength(0);
  });

  test('answers only to an administrator', async () => {
    await reset();

    expect(
      errorCode(
        await evaluate(alice(), [{ symbol: 'BTC-USD', price: '71000.00' }]),
      ),
    ).toBe('FORBIDDEN');
    expect(
      errorCode(
        await evaluate('not-a-token', [
          { symbol: 'BTC-USD', price: '71000.00' },
        ]),
      ),
    ).toBe('UNAUTHENTICATED');
  });
});

describe('the settings operations', () => {
  test('setWebhookUrl saves a URL the guard allows, and refuses one it does not', async () => {
    await reset();

    const saved = await query(
      'mutation($url: String!) { setWebhookUrl(url: $url) { userId webhookUrl email sms webhook } }',
      {
        token: alice(),
        variables: { url: 'http://127.0.0.1:4010/webhook/alice-second' },
      },
    );
    expect(saved.data).toEqual({
      setWebhookUrl: {
        userId: 'u-alice',
        webhookUrl: 'http://127.0.0.1:4010/webhook/alice-second',
        email: true,
        sms: true,
        webhook: true,
      },
    });

    const refused = await query(
      'mutation($url: String!) { setWebhookUrl(url: $url) { webhookUrl } }',
      {
        token: alice(),
        variables: { url: 'http://127.0.0.1:3000/api/v1/health' },
      },
    );
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(refused.errors?.[0]?.message).toContain(
      'not on the webhook allowlist',
    );
    // Nothing was saved: the URL is still the one the operation before it saved.
    const read = await query(
      'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { webhookUrl } } }',
      {
        token: alice(),
        variables: { representations: [{ __typename: 'User', id: 'u-alice' }] },
      },
    );
    expect(read.data).toEqual({
      _entities: [{ webhookUrl: 'http://127.0.0.1:4010/webhook/alice-second' }],
    });
  });

  test('registerWebhook saves the URL as given: the guard decides at delivery time', async () => {
    await reset();

    const saved = await query(
      'mutation($url: String!) { registerWebhook(url: $url) { webhookUrl } }',
      {
        token: alice(),
        variables: { url: 'http://127.0.0.1:3000/api/v1/health' },
      },
    );
    expect(saved.data).toEqual({
      registerWebhook: { webhookUrl: 'http://127.0.0.1:3000/api/v1/health' },
    });
  });

  test('setChannel writes the one channel the enum names', async () => {
    await reset();

    const sms = await query(
      'mutation($name: ChannelName!, $enabled: Boolean!) { setChannel(name: $name, enabled: $enabled) { userId webhookUrl email sms webhook } }',
      { token: alice(), variables: { name: 'SMS', enabled: false } },
    );
    expect(sms.data).toEqual({
      setChannel: {
        userId: 'u-alice',
        webhookUrl: 'http://127.0.0.1:4010/webhook/alice',
        email: true,
        sms: false,
        webhook: true,
      },
    });
  });

  test('setChannels writes only the fields the input gave', async () => {
    await reset();

    const written = await query(
      'mutation($input: ChannelsInput!) { setChannels(input: $input) { email sms webhook } }',
      { token: alice(), variables: { input: { email: false } } },
    );
    expect(written.data).toEqual({
      setChannels: { email: false, sms: true, webhook: true },
    });
  });
});

describe('the alert operations', () => {
  test("alerts answers the caller's own alerts, and no one else's", async () => {
    await reset();

    const own = await query(
      '{ alerts { id userId symbol direction threshold label enabled } }',
      { token: alice() },
    );
    expect(own.data).toEqual({
      alerts: [
        {
          id: '1',
          userId: 'u-alice',
          symbol: 'BTC-USD',
          direction: 'ABOVE',
          threshold: '70000.00',
          label: 'Take profit',
          enabled: true,
        },
      ],
    });
  });

  test("User.alerts answers the caller's own user, and any user for an administrator", async () => {
    await reset();

    const representations = (id: string) => ({
      __typename: 'User',
      id,
    });
    const own = await query(
      'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { alerts { id symbol } } } }',
      {
        token: alice(),
        variables: { representations: [representations('u-alice')] },
      },
    );
    expect(own.data).toEqual({
      _entities: [{ alerts: [{ id: '1', symbol: 'BTC-USD' }] }],
    });

    const asAdmin = await query(
      'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { alerts { id symbol } } } }',
      {
        token: admin(),
        variables: { representations: [representations('u-bob')] },
      },
    );
    expect(asAdmin.data).toEqual({
      _entities: [{ alerts: [{ id: '2', symbol: 'ETH-USD' }] }],
    });
  });

  test('createAlert stores an enabled alert, its label logged JSON-encoded and recorded as a field', async () => {
    await reset();
    const logged: string[] = [];
    const spy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
    try {
      const created = await query(
        'mutation($input: CreateAlertInput!) { createAlert(input: $input) { id userId symbol direction threshold label enabled createdAt } }',
        {
          token: alice(),
          variables: {
            input: {
              symbol: 'ETH-USD',
              direction: 'BELOW',
              threshold: '2900.00',
              label: 'Two\nlines',
            },
          },
        },
      );
      expect(created.errors).toBeUndefined();
      expect(created.data?.createAlert).toMatchObject({
        userId: 'u-alice',
        symbol: 'ETH-USD',
        direction: 'BELOW',
        threshold: '2900.00',
        label: 'Two\nlines',
        enabled: true,
      });

      const encoded = logged.find((line) => line.startsWith('alert created:'));
      expect(encoded).toBeDefined();
      expect(encoded).not.toContain('\n');
      expect(JSON.parse(encoded!.replace(/^alert created: /, '')).label).toBe(
        'Two\nlines',
      );

      const record = logged.find((line) =>
        line.startsWith('{"record":"alert-label"'),
      );
      expect(record).toBeDefined();
      expect(JSON.parse(record!).label).toBe('Two\nlines');
    } finally {
      spy.mockRestore();
    }
  });

  test('createRuleAlert builds the same alert from an input with no free-text field', async () => {
    await reset();

    const created = await query(
      'mutation($rule: RuleInput!) { createRuleAlert(rule: $rule) { id userId symbol direction threshold label } }',
      {
        token: alice(),
        variables: {
          rule: { symbol: 'SOL-USD', direction: 'ABOVE', threshold: '165.00' },
        },
      },
    );
    expect(created.errors).toBeUndefined();
    expect(created.data?.createRuleAlert).toMatchObject({
      userId: 'u-alice',
      symbol: 'SOL-USD',
      direction: 'ABOVE',
      threshold: '165.00',
      label: null,
    });
  });

  test("deleteAlert deletes the caller's own, refuses another user's and an unknown one", async () => {
    await reset();

    const deleted = await query(
      'mutation($id: ID!) { deleteAlert(id: $id) { id userId } }',
      { token: alice(), variables: { id: '1' } },
    );
    expect(deleted.data).toEqual({
      deleteAlert: { id: '1', userId: 'u-alice' },
    });

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
});

describe('the webhook operations', () => {
  test('previewWebhook delivers once through the guard and returns the record', async () => {
    await reset();
    receiver.reset();

    const preview = await query(
      'mutation($url: String!) { previewWebhook(url: $url) { id alertId url status attempts lastError } }',
      {
        token: alice(),
        variables: { url: 'http://127.0.0.1:4010/webhook/alice' },
      },
    );
    expect(preview.errors).toBeUndefined();
    expect(preview.data?.previewWebhook).toMatchObject({
      alertId: null,
      url: 'http://127.0.0.1:4010/webhook/alice',
      status: 'DELIVERED',
      attempts: 1,
      lastError: null,
    });
    expect(receiver.requestsTo('/webhook/alice')).toHaveLength(1);
    expect(receiver.requestsTo('/webhook/alice')[0]!.signatureVerified).toBe(
      true,
    );
  });

  test('POST /internal/webhooks/test makes one guarded delivery, its JSON body parsed by the middleware', async () => {
    await reset();
    receiver.reset();

    const response = await request(`${service.url}/internal/webhooks/test`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alice()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'http://127.0.0.1:4010/webhook/alice' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      userId: 'u-alice',
      url: 'http://127.0.0.1:4010/webhook/alice',
      status: 'DELIVERED',
      attempts: 1,
      responseBody: '{"received":true}',
    });
    expect(receiver.requestsTo('/webhook/alice')).toHaveLength(1);
  });

  test("GET /internal/deliveries answers the caller's records whole, responseBody included", async () => {
    await reset();
    receiver.reset();

    await request(`${service.url}/internal/webhooks/test`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alice()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'http://127.0.0.1:4010/webhook/alice' }),
    });

    const response = await request(`${service.url}/internal/deliveries`, {
      headers: { authorization: `Bearer ${alice()}` },
    });
    const records = (await response.json()) as Record<string, unknown>[];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      userId: 'u-alice',
      url: 'http://127.0.0.1:4010/webhook/alice',
      status: 'DELIVERED',
      responseBody: '{"received":true}',
    });
  });
});

describe('the alert imports', () => {
  test("POST /internal/alerts/import creates the caller's alerts from the content, fetching nothing", async () => {
    await reset();
    receiver.reset();

    const response = await request(`${service.url}/internal/alerts/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alice()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        json: JSON.stringify([
          {
            symbol: 'SOL-USD',
            direction: 'ABOVE',
            threshold: '170.00',
            label: 'Imported',
          },
        ]),
      }),
    });

    expect(response.status).toBe(201);
    const created = (await response.json()) as Record<string, unknown>[];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      userId: 'u-alice',
      symbol: 'SOL-USD',
      threshold: '170.00',
    });
    expect(receiver.requests()).toHaveLength(0);
  });

  test('POST /internal/alerts/import refuses content that is not an alert document', async () => {
    await reset();

    const response = await request(`${service.url}/internal/alerts/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alice()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: 'http://127.0.0.1:4010/internal/health' }),
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain(
      'not an alert document',
    );
  });

  test('POST /internal/alerts/import-url imports from an allowed origin through the guard', async () => {
    await reset();

    const response = await request(
      `${service.url}/internal/alerts/import-url`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${alice()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ url: 'http://127.0.0.1:4010/alerts' }),
      },
    );

    expect(response.status).toBe(201);
    const created = (await response.json()) as Record<string, unknown>[];
    expect(created[0]).toMatchObject({
      symbol: 'SOL-USD',
      threshold: '170.00',
      label: 'From the receiver',
    });
  });

  test('POST /internal/alerts/import-url refuses an origin that is not on the allowlist', async () => {
    await reset();

    const response = await request(
      `${service.url}/internal/alerts/import-url`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${alice()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ url: 'http://127.0.0.1:3000/api/v1/health' }),
      },
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain(
      'not on the webhook allowlist',
    );
  });
});

describe('the announcement operations', () => {
  test('broadcastAnnouncement stores the announcement with sentAt and delivers through the notifier command', async () => {
    await reset();

    const broadcast = await query(
      'mutation($input: AnnouncementInput!) { broadcastAnnouncement(input: $input) { id title body authorId sentAt } }',
      {
        token: admin(),
        variables: {
          input: {
            title: 'Scheduled maintenance',
            body: 'The lab restarts at 02:00 UTC.',
          },
        },
      },
    );
    expect(broadcast.errors).toBeUndefined();
    expect(broadcast.data?.broadcastAnnouncement).toMatchObject({
      id: '2',
      title: 'Scheduled maintenance',
      authorId: 'u-admin',
      sentAt: expect.any(String) as string,
    });

    const records = (await (
      await request(`${service.url}/internal/deliveries`, {
        headers: { authorization: `Bearer ${alice()}` },
      })
    ).json()) as Record<string, unknown>[];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 'DELIVERED', attempts: 1 });
    expect(String(records[0]!.responseBody)).toContain('Scheduled maintenance');
    expect(String(records[0]!.responseBody)).toContain(
      'The lab restarts at 02:00 UTC.',
    );
  });

  test('POST /internal/announcements/notify sends plain text in process, and no process is started', async () => {
    await reset();
    receiver.reset();

    const response = await request(
      `${service.url}/internal/announcements/notify`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${admin()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ title: 'Hello', body: 'Plain text body.' }),
      },
    );

    expect(response.status).toBe(201);
    const answered = (await response.json()) as {
      announcement: { title: string };
      deliveries: Record<string, unknown>[];
    };
    expect(answered.announcement.title).toBe('Hello');
    expect(answered.deliveries).toHaveLength(5);
    expect(answered.deliveries[0]).toMatchObject({ status: 'DELIVERED' });

    const seen = receiver.requestsTo('/webhook/alice');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.signatureVerified).toBe(true);
    expect(JSON.parse(seen[0]!.rawBody).notice).toContain('Plain text body.');
  });

  test('the announcement as JSON carries nosniff, and the page is escaped HTML with a CSP', async () => {
    await reset();

    const asJson = await request(`${service.url}/internal/announcements/1`);
    expect(asJson.status).toBe(200);
    expect(asJson.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await asJson.json()).toMatchObject({
      id: '1',
      title: 'Welcome to VCX',
    });

    const page = await request(`${service.url}/internal/announcements/1/page`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain(
      "script-src 'none'",
    );
    const html = await page.text();
    expect(html).toContain('<h1>Welcome to VCX</h1>');

    const missing = await request(
      `${service.url}/internal/announcements/99/page`,
    );
    expect(missing.status).toBe(404);
  });
});
