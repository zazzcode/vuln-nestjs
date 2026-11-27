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
import { AppModule } from '../../src/app.module.js';
import { WebhookReceiver } from '../support/receiver.js';

// DESER-002 and DESER-003: one payload, sent to the vulnerable operation and
// to each protected counterpart. The receiver of the seeded webhooks runs,
// because the smart alert delivers when its expression says so.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;
let receiver: WebhookReceiver;

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

/** The last of Alice's alerts, whole. */
const lastAlertOf = async (): Promise<{
  id: string;
  label: string | null;
}> => {
  const answer = await query(
    'query { alerts { id label symbol direction threshold } }',
    { token: alice() },
  );
  const alerts = (
    answer.data as { alerts: { id: string; label: string | null }[] } | null
  )?.alerts;
  if (alerts === undefined) {
    throw new Error(answer.errors?.[0]?.message ?? 'no alerts');
  }
  return alerts.at(-1)!;
};

/** Alice's delivery records, whole: what a run printed or was sent is the evidence. */
const aliceRecords = async (): Promise<
  { alertId: number | null; responseBody: string | null }[]
> =>
  (await (
    await request(`${service.url}/internal/deliveries`, {
      headers: { authorization: `Bearer ${alice()}` },
    })
  ).json()) as { alertId: number | null; responseBody: string | null }[];

describe('DESER-002: an alert expression that is code', () => {
  // One attacker value: an expression that rewrites the row it runs against.
  const expression = 'alert.label = "zazzles-lab-marker", true';
  // A price no structured rule crosses, so only the expression can deliver.
  const prices = [{ symbol: 'BTC-USD', price: '1000.00' }];

  test('the exploit: the stored expression runs at evaluation and rewrites the row', async () => {
    await reset();

    const created = await query(
      'mutation($expression: String!) { createSmartAlert(expression: $expression) { id label } }',
      { token: alice(), variables: { expression } },
    );
    expect(created.errors).toBeUndefined();
    expect(created.data).toMatchObject({
      createSmartAlert: { label: 'smart alert' },
    });

    const deliveries = await query(
      'mutation($prices: [PriceInput!]!) { evaluateAlerts(prices: $prices) { alertId } }',
      { token: admin(), variables: { prices } },
    );
    expect(deliveries.errors).toBeUndefined();

    // The expression returned true for a price nothing crossed, and its
    // assignment stayed: the stored string ran as code.
    const alert = await lastAlertOf();
    expect(alert.label).toBe('zazzles-lab-marker');
    const records = await aliceRecords();
    expect(records.map((record) => record.alertId)).toEqual([Number(alert.id)]);
  });

  test('counterpart 1: createAlert keeps the string a label, and it delivers nothing', async () => {
    await reset();

    const created = await query(
      'mutation($input: CreateAlertInput!) { createAlert(input: $input) { id label } }',
      {
        token: alice(),
        variables: {
          input: {
            symbol: 'BTC-USD',
            direction: 'ABOVE',
            threshold: '999999.00',
            label: expression,
          },
        },
      },
    );
    expect(created.errors).toBeUndefined();

    await query(
      'mutation($prices: [PriceInput!]!) { evaluateAlerts(prices: $prices) { alertId } }',
      { token: admin(), variables: { prices } },
    );

    // The same string is the label still, inert, and no delivery was made.
    const alert = await lastAlertOf();
    expect(alert.label).toBe(expression);
    expect(await aliceRecords()).toEqual([]);
  });

  test('counterpart 2: createRuleAlert keeps the string a symbol, and expression is not a field', async () => {
    await reset();

    const created = await query(
      'mutation($rule: RuleInput!) { createRuleAlert(rule: $rule) { id label } }',
      {
        token: alice(),
        variables: {
          rule: {
            symbol: expression,
            direction: 'ABOVE',
            threshold: '999999.00',
          },
        },
      },
    );
    expect(created.errors).toBeUndefined();

    await query(
      'mutation($prices: [PriceInput!]!) { evaluateAlerts(prices: $prices) { alertId } }',
      { token: admin(), variables: { prices } },
    );

    // The same string is the symbol still — no price is quoted for it, so no
    // delivery — and the rule input has no property an expression could ride.
    const alert = await lastAlertOf();
    expect(alert.label).toBe(null);
    expect(await aliceRecords()).toEqual([]);

    const refused = await query(
      'mutation($rule: RuleInput!) { createRuleAlert(rule: $rule) { id } }',
      {
        token: alice(),
        variables: {
          rule: {
            symbol: 'BTC-USD',
            expression,
            direction: 'ABOVE',
            threshold: '999999.00',
          },
        },
      },
    );
    // The rule does not have the property: input coercion refuses it by name.
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(refused.errors?.[0]?.message).toContain('"expression"');
  });
});

describe('DESER-003: an announcement body that is a template', () => {
  // One attacker value: a body whose tags are compiled, not printed.
  const title = 'Scheduled maintenance';
  const body = 'Scheduled maintenance at 02:00 UTC. <%= 7*7 %>';

  test('the exploit: POST /internal/announcements/send renders the tags', async () => {
    await reset();

    const response = await request(
      `${service.url}/internal/announcements/send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${admin()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ title, body }),
      },
    );

    expect(response.status).toBe(201);
    const [record] = (await aliceRecords()).slice(-1);
    // The tags were compiled: what the record holds is their value, not the text.
    expect(record?.responseBody).toContain('49');
    expect(record?.responseBody).not.toContain('<%= 7*7 %>');
  });

  test('counterpart 1: broadcastAnnouncement keeps the body data, tags and all', async () => {
    await reset();

    const sent = await query(
      'mutation($input: AnnouncementInput!) { broadcastAnnouncement(input: $input) { title } }',
      { token: admin(), variables: { input: { title, body } } },
    );
    expect(sent.errors).toBeUndefined();

    const [record] = (await aliceRecords()).slice(-1);
    // A fixed template renders the body as data: the tags are printed as text.
    expect(record?.responseBody).toContain('<%= 7*7 %>');
    expect(record?.responseBody).not.toContain('49');
  });

  test('counterpart 2: POST /internal/announcements/notify sends the body as plain text', async () => {
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
        body: JSON.stringify({ title, body }),
      },
    );

    expect(response.status).toBe(201);
    const toAlice = receiver.requestsTo('/webhook/alice').at(-1);
    // No template engine at all: the receiver was sent the tags as text.
    expect(toAlice?.rawBody).toContain('<%= 7*7 %>');
    expect(toAlice?.rawBody).not.toContain('49');
  });
});
