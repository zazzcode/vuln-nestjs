import { ExpressAdapter } from '@nestjs/platform-express';
import {
  graphql,
  request,
  runSecret,
  sessionToken,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../../src/app.module.js';
import { WebhookReceiver } from '../support/receiver.js';

// OS-001 and OS-002: one payload, sent to the vulnerable operation and to
// each protected counterpart. The marker of both is read back from a
// delivery record, so the receiver of the seeded webhooks runs.
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

/** Alice's delivery records, whole: `responseBody` is what a run printed. */
const aliceRecords = async (): Promise<
  { status: string; responseBody: string | null; lastError: string | null }[]
> =>
  (
    (await (
      await request(`${service.url}/internal/deliveries`, {
        headers: { authorization: `Bearer ${alice()}` },
      })
    ).json()) as {
      status: string;
      responseBody: string | null;
      lastError: string | null;
    }[]
  ).slice(-1);

describe('OS-001: a title that reaches a shell', () => {
  // One attacker value: the title, with a command hidden in its closing quote.
  const title = 'Maintenance"; echo zazzles-lab-marker; echo "';
  const body = 'Scheduled maintenance at 02:00 UTC.';

  test('the exploit: POST /internal/announcements/send runs a command the caller wrote', async () => {
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
    const [record] = await aliceRecords();
    expect(record?.status).toBe('DELIVERED');
    // A line that is exactly the marker: the echo the caller planted ran.
    expect(record?.responseBody?.split('\n')).toContain('zazzles-lab-marker');
  });

  test('counterpart 1: broadcastAnnouncement holds the title together, on one line', async () => {
    await reset();

    const sent = await query(
      'mutation($input: AnnouncementInput!) { broadcastAnnouncement(input: $input) { id title } }',
      { token: admin(), variables: { input: { title, body } } },
    );

    expect(sent.errors).toBeUndefined();
    expect(sent.data).toMatchObject({ broadcastAnnouncement: { title } });
    const [record] = await aliceRecords();
    expect(record?.status).toBe('DELIVERED');
    // The title travelled as one argument: it is one line, and no line is the marker.
    expect(record?.responseBody?.split('\n')).toContain(title);
    expect(record?.responseBody?.split('\n')).not.toContain(
      'zazzles-lab-marker',
    );
  });

  test('counterpart 2: POST /internal/announcements/notify sends text and starts no process', async () => {
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
    // The title travelled as data: JSON-encoded, one line, its quote escaped.
    expect(JSON.parse(toAlice?.rawBody ?? '{}')).toMatchObject({ title });
    expect(toAlice?.rawBody?.split('\n')).not.toContain('zazzles-lab-marker');
    const [record] = await aliceRecords();
    // The record holds the receiver's answer, not a command's output: no process ran.
    expect(record?.responseBody).toBe('{"received":true}');
  });
});
