import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  graphql,
  request,
  runSecret,
  sessionToken,
  startService,
  type ServiceHandle,
} from '@zazzles/exchange-testing';
import { AppModule } from '../../src/app.module.js';

// The exports family: a memo that becomes a spreadsheet formula (INJECT-001)
// and a download that leaves its directory (FS-004).
const JWT_SECRET = runSecret();
const SERVICE_TOKEN = runSecret();

let service: ServiceHandle;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  service = await startService({
    module: AppModule,
    adapter: () => new FastifyAdapter({ http2: true }),
    port: 3102,
  });
}, 300_000);

afterAll(async () => {
  await service?.stop();
});

const tokenOf = (sub: string, role: 'ADMIN' | 'USER' = 'USER'): string =>
  sessionToken(JWT_SECRET, { sub, sid: `s-${sub}`, role });
const alice = tokenOf('u-alice');
const bob = tokenOf('u-bob');
const call = (path: string, token: string) =>
  request(`${service.url}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
const reset = () =>
  request(`${service.url}/internal/lab/reset`, {
    method: 'POST',
    headers: { 'x-internal-token': SERVICE_TOKEN },
  });

describe('INJECT-001 — trades-raw.csv writes the memo as it is', () => {
  beforeEach(reset);

  test('a memo of =zazzles-lab-marker reaches the CSV as a formula', async () => {
    const response = await call('/internal/reports/trades-raw.csv', alice);

    const body = await response.text();
    // Alice's own export carries her order's memo; what was gained is a cell a spreadsheet will compute.
    expect(response.status).toBe(200);
    expect(body).toContain('=zazzles-lab-marker');
    expect(body).not.toContain("'=zazzles-lab-marker");
  });

  test('the CSV counterpart writes the same memo as text: an apostrophe first', async () => {
    const response = await call('/internal/reports/trades.csv', alice);

    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("'=zazzles-lab-marker");
    expect(body).not.toMatch(/[^']=zazzles-lab-marker/);
  });

  test('the JSON counterpart is data, an attachment', async () => {
    const response = await call('/internal/reports/trades.json', alice);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="trades.json"',
    );
    const body = (await response.json()) as {
      trades: Array<{ memo: string | null }>;
    };
    expect(
      body.trades.some((trade) => trade.memo === '=zazzles-lab-marker'),
    ).toBe(true);
  });
});

describe('FS-004 — reports/files/:name joins the name to the directory', () => {
  beforeEach(reset);

  test('the traversal reads this service\u2019s own manifest', async () => {
    const response = await call(
      '/internal/reports/files/..%2F..%2Fpackage.json',
      alice,
    );

    const body = await response.text();
    // What was gained: a file outside the reports directory, on a user's token.
    expect(response.status).toBe(200);
    expect(body).toContain('"@zazzles/exchange-trading"');
  });

  test('the by-id counterpart: the name comes from the database row', async () => {
    const response = await call('/internal/reports/1', alice);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      report: {
        id: '1',
        userId: 'u-alice',
        storedName: 'statement-u-alice.csv',
      },
    });
    // A report that is not stored answers nothing.
    const missing = await call('/internal/reports/99', alice);
    expect(missing.status).toBe(404);
  });

  test('the file counterpart refuses the traversal: FORBIDDEN, outside the directory', async () => {
    const response = await call(
      '/internal/reports/file/..%2F..%2Fpackage.json',
      alice,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: 'A report is read under its own directory',
    });
  });
});

// FS-004's file route, for the caller's own stored name, serves the file.
describe('the reports of the caller, as the seed left them', () => {
  test('a stored statement downloads by its stored name', async () => {
    const response = await call(
      '/internal/reports/file/statement-u-alice.csv',
      alice,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('asset,balance');
    // Another user's statement is not this caller's.
    const bobResponse = await call(
      '/internal/reports/file/statement-u-bob.csv',
      alice,
    );
    expect(bobResponse.status).toBe(404);
    void bob;
  });
});
