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

// XSS-001: one payload, an announcement whose body is a script, sent to the
// vulnerable route and to each protected counterpart. The receiver of the
// seeded webhooks runs, because the announcement is created by a broadcast.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;
let receiver: WebhookReceiver;

const admin = () =>
  sessionToken(JWT_SECRET, { sub: 'u-admin', sid: 's', role: 'ADMIN' });

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

describe('XSS-001: an announcement page that serves script', () => {
  // One attacker value: a body that is a script tag, stored by a broadcast.
  const body = `<img src=x onerror="window.__zazzles='zazzles-lab-marker'">`;

  /** The id of the announcement the payload is stored in. */
  const announcementWithPayload = async (): Promise<number> => {
    const created = await query(
      'mutation($input: AnnouncementInput!) { broadcastAnnouncement(input: $input) { id } }',
      { token: admin(), variables: { input: { title: 'A picture', body } } },
    );
    const id = (
      created.data as { broadcastAnnouncement: { id: string } } | null
    )?.broadcastAnnouncement.id;
    if (id === undefined) {
      throw new Error(created.errors?.[0]?.message ?? 'no announcement');
    }
    return Number(id);
  };

  test('the exploit: GET /internal/announcements/:id/html serves the script as stored', async () => {
    await reset();
    const id = await announcementWithPayload();

    const response = await request(
      `${service.url}/internal/announcements/${id}/html`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toBe(null);
    // The stored markup reaches the page as markup: a browser would run it.
    expect(await response.text()).toContain(body);
  });

  test('counterpart 1: GET /internal/announcements/:id answers JSON, and nothing else', async () => {
    await reset();
    const id = await announcementWithPayload();

    const response = await request(
      `${service.url}/internal/announcements/${id}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    // The payload is a value inside a JSON document, not markup of the page.
    expect(((await response.json()) as { body: string }).body).toBe(body);
  });

  test('counterpart 2: the page escapes the body and allows no script', async () => {
    await reset();
    const id = await announcementWithPayload();

    const response = await request(
      `${service.url}/internal/announcements/${id}/page`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const policy = response.headers.get('content-security-policy');
    expect(policy).toContain("script-src 'none'");
    // Rendered from the fixed template with the body escaped: < is &lt;.
    const page = await response.text();
    expect(page).toContain('&lt;img');
    expect(page).not.toContain('<img');
  });
});
