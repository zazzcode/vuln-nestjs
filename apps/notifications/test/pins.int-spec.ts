import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import {
  graphql,
  request,
  runSecret,
  sessionToken,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { startNotificationsService } from './support/service.js';

// AC11: the three pins this service carries are reached at run time, and
// each installed version is the one in the service's own node_modules.
// The runs go through the service's own operations, never around them.
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;
let hop: Server;
let target: Server;

const alice = () =>
  sessionToken(JWT_SECRET, { sub: 'u-alice', sid: 's', role: 'USER' });

/** The version the service's own node_modules holds for a package. */
function installedVersionOf(packageName: string): string {
  const manifest = JSON.parse(
    readFileSync(
      new URL(`../node_modules/${packageName}/package.json`, import.meta.url),
      'utf8',
    ),
  ) as { version: string };
  return manifest.version;
}

/** A listener on a port the system assigns, on the loopback only. */
function listen(server: Server): Promise<{ url: URL; port: number }> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { address: string; port: number };
      resolve({ url: new URL(`http://127.0.0.1:${port}`), port });
    });
  });
}

function close(server: Server | undefined): Promise<void> {
  return server === undefined
    ? Promise.resolve()
    : new Promise((resolve, reject) =>
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      );
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startNotificationsService();
}, 300_000);

afterAll(async () => {
  await close(hop);
  await close(target);
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

describe('the pins are reached at run time', () => {
  test('node-fetch 2.6.6 carries the delivery through a redirect, headers and all', async () => {
    expect(installedVersionOf('node-fetch')).toBe('2.6.6');

    // The redirect's target: it records what the redirected request
    // carried, and answers with the marker.
    const seen: {
      method: string;
      path: string;
      headers: Record<string, string | string[] | undefined>;
      rawBody: string;
    }[] = [];
    target = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        seen.push({
          method: req.method ?? '',
          path: req.url ?? '/',
          headers: req.headers,
          rawBody: Buffer.concat(chunks).toString('utf8'),
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"reached":"zazzles-lab-marker"}');
      });
    });
    const targetAddress = await listen(target);

    // One hop: it only redirects, with the target's address.
    hop = createServer((req, res) => {
      res.writeHead(307, {
        location: new URL('/redirected', targetAddress.url).href,
      });
      res.end();
    });
    const hopAddress = await listen(hop);

    // The unguarded delivery is the service's own redirect-following path.
    const delivered = await query(
      'mutation($url: String!) { testWebhook(url: $url) { status attempts lastError url } }',
      { token: alice(), variables: { url: hopAddress.url } },
    );

    expect(delivered.errors).toBeUndefined();
    expect(delivered.data?.testWebhook).toMatchObject({
      status: 'DELIVERED',
      attempts: 1,
    });

    // The whole record, `responseBody` included, is the REST read's to give.
    const records = await request(`${service.url}/internal/deliveries`, {
      headers: { authorization: `Bearer ${alice()}` },
    });
    expect(records.status).toBe(200);
    const latest = (
      (await records.json()) as { responseBody: string | null; url: string }[]
    ).at(-1);
    expect(latest).toMatchObject({
      url: hopAddress.url,
      responseBody: '{"reached":"zazzles-lab-marker"}',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.path).toBe('/redirected');
    // The redirected request carries the delivery's headers: the
    // signature over the raw body, and the content type.
    expect(seen[0]!.headers['x-vcx-signature']).toMatch(
      /^sha256=[0-9a-f]{64}$/,
    );
    expect(seen[0]!.headers['content-type']).toBe('application/json');
    expect(seen[0]!.rawBody).toContain('webhook-test');
  });

  test('ejs 3.1.6 renders the announcement page the service serves', async () => {
    expect(installedVersionOf('ejs')).toBe('3.1.6');

    const page = await request(`${service.url}/internal/announcements/1/page`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');

    // What the fixed template rendered, with the announcement as data.
    const html = await page.text();
    expect(html).toContain('Welcome to VCX');
    expect(html).toContain(
      'This is a sample exchange. Every account and every coin on it is invented.',
    );
  });

  test("dot-prop 4.1.0's set walks the path the caller supplied", async () => {
    expect(installedVersionOf('dot-prop')).toBe('4.1.0');

    await reset();
    const written = await query(
      'mutation($path: String!, $enabled: Boolean!) { setChannelByPath(path: $path, enabled: $enabled) { email sms webhook } }',
      { token: alice(), variables: { path: 'email', enabled: false } },
    );

    expect(written.errors).toBeUndefined();
    expect(written.data?.setChannelByPath).toMatchObject({
      email: false,
      sms: true,
      webhook: true,
    });
  });
});
