import 'reflect-metadata';
import { AuthModule } from '@zazzles/exchange-internal-auth';
import { EnvironmentModule } from '@zazzles/exchange-config';
import { Http2Module } from '@zazzles/exchange-http2';
import { runSecret, sessionToken } from '@zazzles/exchange-testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { Environment } from '../src/config/environment.js';
import { EdgeModule } from '../src/edge/edge.module.js';
import { registerEdge } from '../src/edge/edge.js';
import { InternalModule } from '../src/internal/internal.module.js';
import { MarketsModule } from '../src/markets/markets.module.js';
import { OpenapiService } from '../src/openapi/openapi.service.js';
import { standInSubgraphs } from './subgraphs.js';

/**
 * The safe operations of the edge: the thirteen endpoints of its own, the
 * route scopes, and the rate limit on sign-in. The three subgraphs are
 * stand-ins; the pass-through below reads what they received.
 */

const MARKER = `<img src=x onerror="window.__zazzles='zazzles-lab-marker'">`;

function secrets(): void {
  process.env.JWT_SECRET = runSecret();
  process.env.INTERNAL_SERVICE_TOKEN = runSecret();
  process.env.PARTNER_ORIGINS = 'http://127.0.0.1:4021';
  process.env.REDIRECT_ORIGINS = 'http://127.0.0.1:4021';
}

async function startApp(
  imports: Parameters<typeof Test.createTestingModule>[0]['imports'],
): Promise<NestFastifyApplication> {
  const app = (
    await Test.createTestingModule({ imports }).compile()
  ).createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await registerEdge(app);
  await app.init();
  return app;
}

describe('the thirteen safe endpoints of the edge, with the three stand-ins up', () => {
  let app: NestFastifyApplication;
  let subgraphs: Awaited<ReturnType<typeof standInSubgraphs>>;
  let alice: string;
  let admin: string;

  beforeAll(async () => {
    secrets();
    alice = sessionToken(process.env.JWT_SECRET as string, {
      sub: 'u-alice',
      sid: 's-alice',
      role: 'USER',
    });
    admin = sessionToken(process.env.JWT_SECRET as string, {
      sub: 'u-admin',
      sid: 's-admin',
      role: 'ADMIN',
    });
    subgraphs = await standInSubgraphs();
    app = await startApp([AppModule]);
    app.get(OpenapiService).buildFor(app);
  });

  afterAll(async () => {
    await app.close();
    await subgraphs.stopAll();
  });

  // 1 and 2 — health and reset, through the real client.
  test('health answers with every stand-in and its store', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      services: { accounts: { status: 'ok' } },
    });
  });

  test('reset asks every stand-in and answers one status per service', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/lab/reset',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      accounts: 'ok',
      trading: 'ok',
      notifications: 'ok',
    });
  });

  // 3 — the status page: escaped data, headers set by hand.
  test('the status page escapes what it is given and carries CSP, nosniff and frame options', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/status?name=${encodeURIComponent(MARKER)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'self'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.body).not.toContain(MARKER);
    expect(response.body).toContain('&lt;img src=x');
  });

  // 4 — the same report as JSON.
  test('status.json answers JSON with nosniff', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/status.json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'gateway',
      caller: 'visitor',
      backendServices: ['accounts', 'trading', 'notifications'],
    });
  });

  // 5 — the ticker, from trading over the graph transport.
  test('the markets ticker answers the five reference prices', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/markets/ticker',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.markets).toHaveLength(5);
    expect(body.markets.map((m: { symbol: string }) => m.symbol)).toEqual([
      'BTC-USD',
      'ETH-USD',
      'SOL-USD',
      'XRP-USD',
      'DOGE-USD',
    ]);
  });

  // 6 — the partner ticker: CORS for the listed origin only.
  test('the partner ticker echoes a listed origin and no other', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/ticker',
      headers: { origin: 'http://127.0.0.1:4021' },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:4021',
    );
    expect(listed.headers['access-control-allow-credentials']).toBe('true');

    const other = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/ticker',
      headers: { origin: 'http://127.0.0.1:4020' },
    });
    expect(other.statusCode).toBe(200);
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  // 7 — diagnostics for an administrator, and only for one.
  test('admin diagnostics answers allowlisted keys to an administrator, and nobody else', async () => {
    const refused = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/diagnostics',
    });
    expect(refused.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/diagnostics',
      headers: { authorization: `Bearer ${alice}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const answered = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/diagnostics',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(answered.statusCode).toBe(200);
    const body = answered.json();
    expect(Object.keys(body.environment)).toEqual([
      'NODE_ENV',
      'GATEWAY_PORT',
      'ACCOUNTS_PORT',
      'TRADING_PORT',
      'NOTIFICATIONS_PORT',
    ]);
    expect(JSON.stringify(body)).not.toContain(
      process.env.JWT_SECRET as string,
    );
  });

  // 8 and 9 — the API document, for the two callers it belongs to.
  test('the API document answers to an administrator, and refuses everyone else', async () => {
    const refused = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/openapi.json',
    });
    expect(refused.statusCode).toBe(401);

    const answered = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/openapi.json',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(answered.statusCode).toBe(200);
    expect(Object.keys(answered.json().paths)).toContain('/api/v1/health');
  });

  test('the API document answers to the service token, and refuses a caller without it', async () => {
    const refused = await app.inject({
      method: 'GET',
      url: '/api/v1/openapi.json',
    });
    expect(refused.statusCode).toBe(401);

    const answered = await app.inject({
      method: 'GET',
      url: '/api/v1/openapi.json',
      headers: {
        'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN as string,
      },
    });
    expect(answered.statusCode).toBe(200);
    expect(answered.json().openapi).toBe('3.0.0');
  });

  // 10 and 11 — the post-sign-in redirects.
  test('continue redirects to a fixed relative path of this edge', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/continue',
      headers: { authorization: `Bearer ${alice}` },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/api/v1/status');
  });

  test('continue-allowlisted follows only an origin the operator listed', async () => {
    const offSite = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/continue-allowlisted?next=http%3A%2F%2F127.0.0.1%3A4010%2Flanding',
      headers: { authorization: `Bearer ${alice}` },
    });
    expect(offSite.statusCode).toBe(302);
    expect(offSite.headers.location).toBe('/api/v1/status');

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/continue-allowlisted?next=http%3A%2F%2F127.0.0.1%3A4021%2Flanding',
      headers: { authorization: `Bearer ${alice}` },
    });
    expect(listed.statusCode).toBe(302);
    expect(listed.headers.location).toBe('http://127.0.0.1:4021/landing');
  });

  // 12 — a preference change that needs a bearer header and a JSON body.
  test('preferences/json carries a JSON body to the profile, and refuses a form body', async () => {
    const carried = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences/json',
      headers: {
        authorization: `Bearer ${alice}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ displayName: 'Alice' }),
    });
    expect(carried.statusCode).toBe(200);
    const echoed = carried.json();
    expect(echoed.service).toBe('accounts');
    expect(echoed.reached.path).toBe('/internal/profile');
    expect(echoed.reached.method).toBe('PUT');
    expect(echoed.reached.body).toEqual({ displayName: 'Alice' });

    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences/json',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ displayName: 'Alice' }),
    });
    expect(unauthenticated.statusCode).toBe(401);

    const form = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences/json',
      headers: {
        authorization: `Bearer ${alice}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'displayName=Alice',
    });
    expect(form.statusCode).toBe(415);
    expect(form.json().message).toBe('A JSON body is required');
  });

  // 13 — a preference change behind a CSRF token.
  test('preferences/csrf issues a token, refuses a post without it, and carries one with it', async () => {
    const issued = await app.inject({
      method: 'GET',
      url: '/api/v1/profile/preferences/csrf',
      headers: { authorization: `Bearer ${alice}` },
    });
    expect(issued.statusCode).toBe(200);
    const { token } = issued.json() as { token: string };
    const setCookie = issued.headers['set-cookie'];
    const cookies = (Array.isArray(setCookie) ? setCookie : [String(setCookie)])
      .flatMap((cookie) => String(cookie).split('\n'))
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    expect(cookies).toContain('_csrf=');

    const withoutToken = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences/csrf',
      headers: {
        authorization: `Bearer ${alice}`,
        cookie: cookies,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ displayName: 'Alice' }),
    });
    expect(withoutToken.statusCode).toBe(403);

    const carried = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/preferences/csrf',
      headers: {
        authorization: `Bearer ${alice}`,
        cookie: cookies,
        'x-csrf-token': token,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ displayName: 'Alice' }),
    });
    expect(carried.statusCode).toBe(200);
    const echoed = carried.json();
    expect(echoed.reached.path).toBe('/internal/profile');
    expect(echoed.reached.body).toEqual({ displayName: 'Alice' });
  });

  // The default scope: helmet's headers, and no CORS answer at all.
  test('a default-scope answer carries security headers and no CORS header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://127.0.0.1:4020' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  // The rate limit on sign-in: ten a minute from one address.
  test('the eleventh sign-in from one address inside a minute is refused', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 11 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/sign-in',
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ email: 'alice@vcx.exchange' }),
        }),
      ),
    );
    const statuses = attempts.map((attempt) => attempt.statusCode);
    // The stand-in answers a create with 201; the eleventh never reaches it.
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
    expect(statuses[10]).toBe(429);
    expect(attempts[10].headers['retry-after']).toBeDefined();
    // Ten reached the service; the eleventh was refused at the edge.
    const signIn = subgraphs.accounts.reached.filter(
      (reached) => reached.path === '/internal/sessions/typed',
    );
    expect(signIn).toHaveLength(10);
  });
});

describe('the REST pass-through, through the stand-ins', () => {
  let app: NestFastifyApplication;
  let subgraphs: Awaited<ReturnType<typeof standInSubgraphs>>;
  let alice: string;
  let admin: string;

  beforeAll(async () => {
    secrets();
    alice = sessionToken(process.env.JWT_SECRET as string, {
      sub: 'u-alice',
      sid: 's-alice',
      role: 'USER',
    });
    admin = sessionToken(process.env.JWT_SECRET as string, {
      sub: 'u-admin',
      sid: 's-admin',
      role: 'ADMIN',
    });
    subgraphs = await standInSubgraphs();
    app = await startApp([AppModule]);
  });

  afterAll(async () => {
    await app.close();
    await subgraphs.stopAll();
  });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const of = (service: 'accounts' | 'trading' | 'notifications') =>
    subgraphs[service].reached.at(-1);

  // accounts — one module at a time.
  test('auth: the login route carries a public post to the sessions path', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'alice@vcx.exchange' }),
    });

    expect(response.statusCode).toBe(201);
    const reached = of('accounts');
    expect(reached?.path).toBe('/internal/sessions');
    expect(reached?.method).toBe('POST');
    expect(reached?.protocol).toBe('2.0');
    expect(reached?.body).toEqual({ email: 'alice@vcx.exchange' });
  });

  test('auth: whoami answers to any token the service issued', async () => {
    const refused = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/whoami',
    });
    expect(refused.statusCode).toBe(401);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/whoami',
      headers: bearer(alice),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().reached.path).toBe('/internal/sessions/decoded');
  });

  test('profile: a put crosses with its body, the caller, and the service token', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/profile',
      headers: { ...bearer(alice), 'content-type': 'application/json' },
      payload: JSON.stringify({ displayName: 'Alice' }),
    });

    expect(response.statusCode).toBe(200);
    const reached = of('accounts');
    expect(reached?.path).toBe('/internal/profile');
    expect(reached?.method).toBe('PUT');
    expect(reached?.body).toEqual({ displayName: 'Alice' });
    expect(reached?.headers.authorization).toBe(`Bearer ${alice}`);
    expect(reached?.headers['x-internal-token']).toBe(
      process.env.INTERNAL_SERVICE_TOKEN,
    );
  });

  test('profile: a cookie identifies the caller where no bearer is sent', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: {
        cookie: `vcx_session=${alice}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ displayName: 'A' }),
    });

    expect(response.statusCode).toBe(200);
    expect(of('accounts')?.headers.cookie).toBe(`vcx_session=${alice}`);
  });

  test('documents: a body of a content type the edge does not parse crosses as it arrived', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/profile/documents',
      headers: {
        ...bearer(alice),
        'content-type': 'multipart/form-data; boundary=x',
      },
      payload:
        '--x\r\nContent-Disposition: form-data; name="file"\r\n\r\nzazzles-lab-marker\r\n--x--',
    });

    expect(response.statusCode).toBe(201);
    const reached = of('accounts');
    expect(reached?.path).toBe('/internal/documents');
    expect(String(reached?.body)).toContain('zazzles-lab-marker');
    expect(reached?.headers['content-type']).toBe(
      'multipart/form-data; boundary=x',
    );
  });

  test('users: the query crosses as written, to an administrator only', async () => {
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/users?role=USER&q=alice',
      headers: bearer(alice),
    });
    expect(forbidden.statusCode).toBe(403);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/users?role=USER&q=alice',
      headers: bearer(admin),
    });
    expect(response.statusCode).toBe(200);
    const reached = of('accounts');
    expect(reached?.path).toBe('/internal/users?role=USER&q=alice');
    expect(reached?.headers.authorization).toBe(`Bearer ${admin}`);
  });

  test('admin-users: the directory page crosses to its service path', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/directory.html',
      headers: bearer(admin),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reached.path).toBe('/internal/admin/directory');
  });

  // trading
  test('admin: a deposit crosses to the trading service over HTTP/2', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/deposits',
      headers: { ...bearer(admin), 'content-type': 'application/json' },
      payload: JSON.stringify({ userId: 'u-alice', amount: '10.00' }),
    });

    expect(response.statusCode).toBe(201);
    const reached = of('trading');
    expect(reached?.path).toBe('/internal/admin/deposits');
    expect(reached?.protocol).toBe('2.0');
    expect(reached?.body).toEqual({ userId: 'u-alice', amount: '10.00' });
  });

  test("wallets: a withdrawal is the caller's own, over the transport trading speaks", async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/wallets/withdraw',
      headers: { ...bearer(alice), 'content-type': 'application/json' },
      payload: JSON.stringify({ amount: '1.00' }),
    });

    expect(response.statusCode).toBe(201);
    expect(of('trading')?.path).toBe('/internal/wallets/withdraw');
  });

  test('orders: a path parameter crosses into the service path', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/orders/9',
      headers: { ...bearer(alice), 'content-type': 'application/json' },
      payload: JSON.stringify({ memo: 'zazzles-lab-marker' }),
    });

    expect(response.statusCode).toBe(200);
    const reached = of('trading');
    expect(reached?.path).toBe('/internal/orders/9');
    expect(reached?.body).toEqual({ memo: 'zazzles-lab-marker' });
  });

  test('reports: the trades sheet crosses with its own content type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/trades.csv?limit=2',
      headers: bearer(alice),
    });

    expect(response.statusCode).toBe(200);
    const reached = of('trading');
    expect(reached?.path).toBe('/internal/reports/trades.csv?limit=2');
    expect(response.headers['content-type']).toContain('application/json');
  });

  // notifications
  test('webhooks: a test delivery crosses to the notifications service over HTTP/1.1', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/test',
      headers: { ...bearer(alice), 'content-type': 'application/json' },
      payload: JSON.stringify({ url: 'http://127.0.0.1:4100/hook' }),
    });

    expect(response.statusCode).toBe(201);
    const reached = of('notifications');
    expect(reached?.path).toBe('/internal/webhooks/test');
    expect(reached?.protocol).toBe('1.1');
  });

  test('alerts: an import crosses with its content, fetching nothing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/import',
      headers: { ...bearer(alice), 'content-type': 'application/json' },
      payload: JSON.stringify([{ symbol: 'BTC-USD' }]),
    });

    expect(response.statusCode).toBe(201);
    expect(of('notifications')?.path).toBe('/internal/alerts/import');
  });

  test('announcements: a public read needs no token, and a path parameter crosses', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/announcements',
    });
    expect(list.statusCode).toBe(200);
    expect(of('notifications')?.path).toBe('/internal/announcements');

    const page = await app.inject({
      method: 'GET',
      url: '/api/v1/announcements/3/page',
    });
    expect(page.statusCode).toBe(200);
    expect(of('notifications')?.path).toBe('/internal/announcements/3/page');

    const html = await app.inject({
      method: 'GET',
      url: '/api/v1/announcements/3.html',
    });
    expect(html.statusCode).toBe(200);
    expect(of('notifications')?.path).toBe('/internal/announcements/3/html');
  });

  test("deliveries: the caller's own deliveries, to a signed-in caller only", async () => {
    const refused = await app.inject({
      method: 'GET',
      url: '/api/v1/deliveries',
    });
    expect(refused.statusCode).toBe(401);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/deliveries',
      headers: bearer(alice),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().reached.path).toBe('/internal/deliveries');
  });

  // A header the caller sent that is not in the forwarded list does not cross.
  test('a header the edge was not asked to forward does not reach the service', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/deliveries',
      headers: { ...bearer(alice), 'x-request-id': 'zazzles-lab-marker' },
    });

    expect(of('notifications')?.headers['x-request-id']).toBeUndefined();
    expect(of('notifications')?.headers.authorization).toBe(`Bearer ${alice}`);
  });
});

describe('the tickers when the trading service is gone', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    secrets();
    // Nobody listens on port 1: the closest a test gets to a service that is not running.
    process.env.TRADING_PORT = '1';
    app = await startApp([
      EnvironmentModule.forRoot(Environment),
      AuthModule,
      Http2Module,
      InternalModule,
      EdgeModule,
      MarketsModule,
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  test('the markets ticker masks the failure', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/markets/ticker',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      message: 'the ticker is unavailable',
    });
  });

  test('the partner ticker answers a request id and nothing of the failure', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/partner/ticker',
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.error).toBe('the ticker is unavailable');
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.body).not.toContain('stack');
  });
});
