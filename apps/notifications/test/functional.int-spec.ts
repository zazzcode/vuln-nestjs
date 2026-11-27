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
  service = await startService({
    module: AppModule,
    adapter: () => new ExpressAdapter(),
    port: 3103,
  });
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
