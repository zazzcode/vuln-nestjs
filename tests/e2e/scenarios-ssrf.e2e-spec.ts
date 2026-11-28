import { errorCode, graphql, request } from '@zazzles/exchange-testing';
import { useLab } from './lab.js';
import { tokenOf } from './scenarios.js';

/**
 * The request-forgery scenarios (SSRF-001 to SSRF-003), against the real lab.
 * Every URL names a sibling service of the running lab — a `/internal/*` path
 * on the relay an HTTP/1.1 client reaches trading by, or on notifications'
 * own listener — and the forged request is really made, from inside the
 * machine, by the service the payload is sent to. One payload, sent to the
 * vulnerable operation and to each protected counterpart of its row.
 */
const lab = useLab();

const alice = () => tokenOf(lab, 'u-alice');
const admin = () => tokenOf(lab, 'u-admin', 'ADMIN');

/** One GraphQL operation through the gateway's composed graph. */
const query = (
  source: string,
  options: { token?: string; variables?: Record<string, unknown> } = {},
) => graphql(`${lab().url}/graphql`, source, options);

/** The caller's delivery records, as the gateway's pass-through reads them. */
const deliveries = async (): Promise<
  { url: string; responseBody: string | null }[]
> => {
  const response = await request(`${lab().url}/api/v1/deliveries`, {
    headers: { authorization: `Bearer ${alice()}` },
  });
  return (await response.json()) as {
    url: string;
    responseBody: string | null;
  }[];
};

/** Returns every store to the fake data, as the gateway's own tooling does. */
const reset = () =>
  request(`${lab().url}/api/v1/lab/reset`, { method: 'POST' });

// SSRF-001 — a webhook posted to any URL. Hardened value: the outbound guard
// the two counterparts put in the way — at the save, and at the delivery.
describe('SSRF-001 — a webhook posted inside the lab', () => {
  // One payload: trading's own internal health endpoint, on the relay in
  // front of it. No allowlist names this origin.
  const url = () => `${lab().http1Url('trading')}/internal/health`;

  test('SSRF-001: testWebhook reaches trading internal endpoint from inside the machine', async () => {
    const exploited = await query(
      'mutation($url: String!) { testWebhook(url: $url) { url status attempts lastError } }',
      { token: alice(), variables: { url: url() } },
    );

    expect(exploited.errors).toBeUndefined();
    // What was gained: the signed webhook POST was made to trading's own
    // internal address — an endpoint protected by network position, not by
    // tokens — and trading itself answered it. The route answers GET only, so
    // the answer is its 404: the proof of the forgery is that the sibling
    // answered at all, and that its answer came back.
    expect(exploited.data).toMatchObject({
      testWebhook: {
        url: url(),
        status: 'FAILED',
        attempts: 1,
        lastError: 'the receiver answered 404',
      },
    });

    // And trading's own answer body came back to the caller, in the delivery
    // record: the message of the endpoint that was reached.
    const record = (await deliveries()).at(-1);
    expect(record?.responseBody).toContain('Cannot POST /internal/health');
  });

  test('SSRF-001 counterpart 1: setWebhookUrl refuses the same URL at save time, and saves nothing', async () => {
    const refused = await query(
      'mutation($url: String!) { setWebhookUrl(url: $url) { webhookUrl } }',
      { token: alice(), variables: { url: url() } },
    );

    // Refused by the outbound guard at save time: the origin is not on the
    // webhook allowlist, and nothing is saved.
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(refused.errors?.[0]?.message).toContain(
      'not on the webhook allowlist',
    );

    const saved = await query('{ me { webhookUrl } }', { token: alice() });
    expect(saved.data).toEqual({
      me: { webhookUrl: 'http://127.0.0.1:4010/webhook/alice' },
    });
  });

  test('SSRF-001 counterpart 2: registerWebhook saves it, and the guard refuses at delivery time', async () => {
    const saved = await query(
      'mutation($url: String!) { registerWebhook(url: $url) { webhookUrl } }',
      { token: alice(), variables: { url: url() } },
    );
    expect(saved.data).toEqual({ registerWebhook: { webhookUrl: url() } });

    const deliveriesMade = await query(
      'mutation($prices: [PriceInput!]!) { evaluateAlerts(prices: $prices) { id url status lastError } }',
      {
        token: admin(),
        variables: { prices: [{ symbol: 'BTC-USD', price: '71000.00' }] },
      },
    );
    expect(deliveriesMade.errors).toBeUndefined();
    // Refused at delivery time: the record is FAILED with the guard's reason,
    // and no request left the service for an origin the allowlist does not
    // name — where the exploit delivered, the counterpart records a refusal.
    expect(deliveriesMade.data?.evaluateAlerts).toEqual([
      expect.objectContaining({
        url: url(),
        status: 'FAILED',
        lastError: expect.stringContaining('not on the webhook allowlist'),
      }),
    ]);

    // The lab is returned to its fake data for the scenarios that follow.
    await reset();
  });
});
