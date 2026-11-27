import { ExpressAdapter } from '@nestjs/platform-express';
import {
  runSecret,
  request,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { labStart } from '@zazzles/exchange-lab-data';
import { AppModule } from '../src/app.module.js';
import { AlertsRepository } from '../src/alerts/alerts.repository.js';
import { AnnouncementsRepository } from '../src/announcements/announcements.repository.js';
import { DeliveriesRepository } from '../src/webhooks/deliveries.repository.js';
import { UserSettingsRepository } from '../src/settings/user-settings.repository.js';
import { UserSettingsEntity } from '../src/settings/user-settings.entity.js';

// The store, proved on its own: the seeded rows at start, a write and a read on
// every table, and reset bringing exactly the seeded rows back.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;
let alerts: AlertsRepository;
let announcements: AnnouncementsRepository;
let deliveries: DeliveriesRepository;
let settings: UserSettingsRepository;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startService({
    module: AppModule,
    adapter: () => new ExpressAdapter(),
    port: 3103,
  });
  alerts = service.app.get(AlertsRepository);
  announcements = service.app.get(AnnouncementsRepository);
  deliveries = service.app.get(DeliveriesRepository);
  settings = service.app.get(UserSettingsRepository);
}, 300_000);

afterAll(async () => {
  await service?.stop();
});

const reset = () =>
  request(`${service.url}/internal/lab/reset`, {
    method: 'POST',
    headers: { 'x-internal-token': SERVICE_TOKEN },
  });

describe('the seeded store', () => {
  test('holds the five seeded alerts, one per user with a wallet, on five markets, enabled', async () => {
    expect(await alerts.findAll()).toEqual([
      {
        id: 1,
        userId: 'u-alice',
        symbol: 'BTC-USD',
        direction: 'ABOVE',
        threshold: '70000.00',
        label: 'Take profit',
        expression: null,
        enabled: true,
        lastTriggeredAt: null,
        createdAt: labStart,
      },
      {
        id: 2,
        userId: 'u-bob',
        symbol: 'ETH-USD',
        direction: 'BELOW',
        threshold: '3000.00',
        label: 'Buy the dip',
        expression: null,
        enabled: true,
        lastTriggeredAt: null,
        createdAt: labStart,
      },
      {
        id: 3,
        userId: 'u-carol',
        symbol: 'SOL-USD',
        direction: 'ABOVE',
        threshold: '160.00',
        label: 'Momentum',
        expression: null,
        enabled: true,
        lastTriggeredAt: null,
        createdAt: labStart,
      },
      {
        id: 4,
        userId: 'u-dave',
        symbol: 'XRP-USD',
        direction: 'BELOW',
        threshold: '0.45',
        label: 'Exit',
        expression: null,
        enabled: true,
        lastTriggeredAt: null,
        createdAt: labStart,
      },
      {
        id: 5,
        userId: 'u-erin',
        symbol: 'DOGE-USD',
        direction: 'ABOVE',
        threshold: '0.15',
        label: 'Moon',
        expression: null,
        enabled: true,
        lastTriggeredAt: null,
        createdAt: labStart,
      },
    ]);
  });

  test('holds one settings row per user with a wallet, every channel on, the webhook on the test receiver', async () => {
    const rows = await settings.findAll();
    expect(
      rows.map((row) => ({
        id: 0,
        userId: row.userId,
        webhookUrl: row.webhookUrl,
        email: row.email,
        sms: row.sms,
        webhook: row.webhook,
      })),
    ).toEqual(
      ['alice', 'bob', 'carol', 'dave', 'erin'].map((name) => ({
        id: 0,
        userId: `u-${name}`,
        webhookUrl: `http://127.0.0.1:4010/webhook/${name}`,
        email: true,
        sms: true,
        webhook: true,
      })),
    );
  });

  test('holds the one seeded announcement, not sent, and no delivery', async () => {
    expect(await announcements.findAll()).toEqual([
      {
        id: 1,
        title: 'Welcome to VCX',
        body: 'This is a sample exchange. Every account and every coin on it is invented.',
        authorId: 'u-admin',
        createdAt: labStart,
        sentAt: null,
      },
    ]);
    expect(await deliveries.findByUserId('u-alice')).toEqual([]);
  });
});

describe('a round trip through every table', () => {
  test('writes an alert and reads it back with the values written', async () => {
    await alerts.insert([
      {
        userId: 'u-alice',
        symbol: 'ETH-USD',
        direction: 'BELOW',
        threshold: '3100.50',
        label: 'ETH dip',
        enabled: false,
      },
    ]);
    const written = await alerts.findById(6);
    expect(written).toMatchObject({
      id: 6,
      userId: 'u-alice',
      symbol: 'ETH-USD',
      direction: 'BELOW',
      threshold: '3100.50',
      label: 'ETH dip',
      enabled: false,
    });
  });

  test('writes a delivery and reads it back with the values written', async () => {
    await deliveries.insert([
      {
        alertId: 1,
        userId: 'u-alice',
        url: 'http://127.0.0.1:4010/webhook/alice',
        status: 'FAILED',
        lastError: 'refused: the origin is not on the allowlist',
        responseBody: null,
      },
    ]);
    const written = await deliveries.findByUserId('u-alice');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      alertId: 1,
      userId: 'u-alice',
      url: 'http://127.0.0.1:4010/webhook/alice',
      status: 'FAILED',
      attempts: 1,
      lastError: 'refused: the origin is not on the allowlist',
      responseBody: null,
      deliveredAt: null,
    });
  });

  test('writes settings and reads them back with the values written', async () => {
    const row = new UserSettingsEntity();
    row.userId = 'u-admin';
    row.webhookUrl = null;
    row.email = false;
    row.sms = false;
    row.webhook = false;
    await settings.save(row);
    expect(await settings.findByUserId('u-admin')).toMatchObject({
      userId: 'u-admin',
      webhookUrl: null,
      email: false,
      sms: false,
      webhook: false,
    });
  });

  test('writes an announcement and reads it back with the values written', async () => {
    await announcements.insert([
      {
        title: 'Second',
        body: 'Plain text.',
        authorId: 'u-admin',
        createdAt: labStart,
        sentAt: labStart,
      },
    ]);
    expect(await announcements.findById(2)).toMatchObject({
      id: 2,
      title: 'Second',
      sentAt: labStart,
    });
  });
});

describe('reset', () => {
  test('returns every table to exactly the seeded rows, with the counters back', async () => {
    expect((await reset()).status).toBe(200);
    expect(await alerts.findAll()).toHaveLength(5);
    expect((await alerts.findById(6)) ?? null).toBeNull();
    expect(await settings.findAll()).toHaveLength(5);
    expect(await settings.findByUserId('u-admin')).toBeNull();
    expect(await announcements.findAll()).toHaveLength(1);
    expect(await deliveries.findByUserId('u-alice')).toEqual([]);

    // The counters came back: the next alert is id 6 again.
    await alerts.insert([
      {
        userId: 'u-bob',
        symbol: 'BTC-USD',
        direction: 'ABOVE',
        threshold: '80000.00',
      },
    ]);
    expect((await alerts.findByUserId('u-bob')).at(-1)?.id).toBe(6);
  });
});
