import {
  errorCode,
  graphql,
  request,
  runSecret,
  sessionToken,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { startNotificationsService } from '../support/service.js';
import { STAND_IN_MARKER, StandInListener } from '../support/stand-in.js';
import { WebhookReceiver } from '../support/receiver.js';

// SSRF-001 and SSRF-003: one payload, sent to the vulnerable operation and to
// each protected counterpart. The stand-in stands in for another service's
// internal endpoint, so the forged request is observed without another service.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;
let receiver: WebhookReceiver;
let standIn: StandInListener;

const admin = () =>
  sessionToken(JWT_SECRET, { sub: 'u-admin', sid: 's', role: 'ADMIN' });
const alice = () =>
  sessionToken(JWT_SECRET, { sub: 'u-alice', sid: 's', role: 'USER' });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startNotificationsService();
  receiver = WebhookReceiver.forSecret(JWT_SECRET);
  await receiver.listen();
  standIn = await StandInListener.start();
}, 300_000);

afterAll(async () => {
  await standIn?.close();
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

describe('SSRF-001: a webhook posted to any URL', () => {
  // One attacker value: the address of an internal endpoint.
  const url = () => `${standIn.url}/internal/health`;

  test('the exploit: testWebhook reaches an internal endpoint from inside the machine', async () => {
    await reset();
    standIn.forget();

    const exploited = await query(
      'mutation($url: String!) { testWebhook(url: $url) { id url status attempts lastError } }',
      { token: alice(), variables: { url: url() } },
    );

    expect(exploited.errors).toBeUndefined();
    expect(exploited.data?.testWebhook).toMatchObject({
      url: url(),
      status: 'DELIVERED',
      attempts: 1,
    });
    // The stand-in received the forged POST, and its marker came back in the record.
    expect(standIn.sawRequestTo('/internal/health')).toBe(true);
    const record = (
      (await (
        await request(`${service.url}/internal/deliveries`, {
          headers: { authorization: `Bearer ${alice()}` },
        })
      ).json()) as { responseBody: string | null }[]
    ).at(-1);
    expect(record?.responseBody).toContain(STAND_IN_MARKER);
  });

  test('counterpart 1: setWebhookUrl refuses the same URL at save time, and saves nothing', async () => {
    await reset();
    standIn.forget();

    const refused = await query(
      'mutation($url: String!) { setWebhookUrl(url: $url) { webhookUrl } }',
      { token: alice(), variables: { url: url() } },
    );

    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(refused.errors?.[0]?.message).toContain(
      'not on the webhook allowlist',
    );
    const saved = await query(
      'query($representations: [_Any!]!) { _entities(representations: $representations) { ... on User { webhookUrl } } }',
      {
        token: alice(),
        variables: { representations: [{ __typename: 'User', id: 'u-alice' }] },
      },
    );
    expect(saved.data).toEqual({
      _entities: [{ webhookUrl: 'http://127.0.0.1:4010/webhook/alice' }],
    });
  });

  test('counterpart 2: registerWebhook saves it, and the guard refuses at delivery time', async () => {
    await reset();
    standIn.forget();

    const saved = await query(
      'mutation($url: String!) { registerWebhook(url: $url) { webhookUrl } }',
      { token: alice(), variables: { url: url() } },
    );
    expect(saved.data).toEqual({ registerWebhook: { webhookUrl: url() } });

    const deliveries = await query(
      'mutation($prices: [PriceInput!]!) { evaluateAlerts(prices: $prices) { id url status lastError } }',
      {
        token: admin(),
        variables: { prices: [{ symbol: 'BTC-USD', price: '71000.00' }] },
      },
    );
    expect(deliveries.data?.evaluateAlerts).toEqual([
      expect.objectContaining({
        url: url(),
        status: 'FAILED',
        lastError: expect.stringContaining('not on the webhook allowlist'),
      }),
    ]);
    expect(standIn.sawRequestTo('/internal/health')).toBe(false);
  });

  test('the guarded client follows no redirect (AC5)', async () => {
    await reset();
    standIn.forget();
    receiver.reset();

    const preview = await query(
      'mutation($url: String!) { previewWebhook(url: $url) { status lastError } }',
      { token: alice(), variables: { url: 'http://127.0.0.1:4010/redirect' } },
    );

    expect(preview.data?.previewWebhook).toMatchObject({
      status: 'FAILED',
      lastError: expect.stringContaining('redirect'),
    });
  });
});

describe('SSRF-003: a URL fetched and its body returned', () => {
  const url = () => `${standIn.url}/internal/health`;

  test("the exploit: POST /internal/alerts/fetch answers the internal endpoint's body", async () => {
    await reset();
    standIn.forget();

    const response = await request(`${service.url}/internal/alerts/fetch`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alice()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: url() }),
    });

    expect(response.status).toBe(200);
    const answered = (await response.json()) as {
      status: number;
      body: string;
    };
    expect(answered.status).toBe(200);
    expect(answered.body).toContain(STAND_IN_MARKER);
    expect(standIn.sawRequestTo('/internal/health')).toBe(true);
  });

  test('counterpart 1: POST /internal/alerts/import takes the content and fetches nothing', async () => {
    await reset();
    standIn.forget();

    const response = await request(`${service.url}/internal/alerts/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alice()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: url() }),
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain(
      'not an alert document',
    );
    expect(standIn.sawRequestTo('/internal/health')).toBe(false);
  });

  test('counterpart 2: POST /internal/alerts/import-url refuses the origin through the guard', async () => {
    await reset();
    standIn.forget();

    const response = await request(
      `${service.url}/internal/alerts/import-url`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${alice()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ url: url() }),
      },
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain(
      'not on the webhook allowlist',
    );
    expect(standIn.sawRequestTo('/internal/health')).toBe(false);
  });
});
