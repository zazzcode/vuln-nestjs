import { ExpressAdapter } from '@nestjs/platform-express';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
let markerDirectory: string;
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
  markerDirectory = await mkdtemp(path.join(tmpdir(), 'vcx-os-002-'));
}, 300_000);

afterAll(async () => {
  await rm(markerDirectory, { recursive: true, force: true });
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

describe('OS-002: an option where a URL was expected', () => {
  // One attacker value: a config file curl is made to read, holding the marker.
  let payloadUrl: string;

  beforeAll(async () => {
    const file = path.join(markerDirectory, 'marker.conf');
    await writeFile(file, 'zazzles-lab-marker\n');
    payloadUrl = `-K${file}`;
  });

  test('the exploit: pingWebhook makes curl read a file the caller named', async () => {
    await reset();

    const exploited = await query(
      'mutation($url: String!) { pingWebhook(url: $url) { url status attempts lastError } }',
      { token: alice(), variables: { url: payloadUrl } },
    );

    expect(exploited.errors).toBeUndefined();
    expect(exploited.data).toMatchObject({
      pingWebhook: { url: payloadUrl, attempts: 1 },
    });
    // The file's line came back: curl read the file at the path the caller chose.
    expect(exploited.data).toMatchObject({
      pingWebhook: { lastError: expect.stringContaining('zazzles-lab-marker') },
    });
  });

  test('counterpart 1: previewWebhook refuses the value before any request', async () => {
    await reset();

    const refused = await query(
      'mutation($url: String!) { previewWebhook(url: $url) { status lastError } }',
      { token: alice(), variables: { url: payloadUrl } },
    );

    expect(refused.errors).toBeUndefined();
    expect(refused.data).toMatchObject({
      previewWebhook: {
        status: 'FAILED',
        lastError: expect.stringContaining('not an absolute http or https URL'),
      },
    });
  });

  test('counterpart 2: POST /internal/webhooks/test records the refusal, and nothing is sent', async () => {
    await reset();

    const response = await request(`${service.url}/internal/webhooks/test`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alice()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: payloadUrl }),
    });

    // A send-time refusal is a recorded delivery, not an error: nothing left the service.
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      url: payloadUrl,
      status: 'FAILED',
      lastError: expect.stringContaining('not an absolute http or https URL'),
    });
  });
});
