import { request } from '@zazzles/exchange-testing';
import { useLab } from './lab.js';
import { tokenOf } from './scenarios.js';

/**
 * The security-misconfiguration scenarios of the gateway's public scope and
 * its open pages (CONFIG-001 to CONFIG-004), against the real lab: the
 * gateway as the launcher starts it, with the services it fronts running.
 * One payload, sent to the vulnerable endpoint and to each protected
 * counterpart of its row.
 */
const lab = useLab();

/** One request to the gateway, which every client reaches over HTTP/1.1. */
const get = (
  path: string,
  headers: Record<string, string> = {},
  method: 'GET' | 'OPTIONS' = 'GET',
) => request(`${lab().url}${path}`, { method, headers });

// CONFIG-001 — the public scope echoes any origin, with credentials.
describe('CONFIG-001 — the public scope echoes any origin, with credentials', () => {
  // One payload: an origin no operator listed, as a browser on another site sends.
  const ORIGIN = 'http://127.0.0.1:4020';

  test('CONFIG-001: the public ticker echoes an origin nobody listed, with credentials', async () => {
    const response = await get('/api/v1/public/ticker', { origin: ORIGIN });

    expect(response.status).toBe(200);
    // What was gained: any site's origin is echoed with credentials allowed,
    // so a signed-in browser lets that site read this scope's answers.
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
  });

  test('CONFIG-001: a preflight for the same origin is answered for any header the site asks', async () => {
    const response = await get(
      '/api/v1/public/ticker',
      {
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
      'OPTIONS',
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'authorization',
    );
  });

  // The identical request to the two protected counterparts.
  test('CONFIG-001 counterpart 1: the markets ticker answers no CORS header at all', async () => {
    const response = await get('/api/v1/markets/ticker', { origin: ORIGIN });

    expect(response.status).toBe(200);
    // Refused by the absence of the mechanism: with no CORS answer, a browser
    // refuses the cross-origin read whatever the page does.
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  test('CONFIG-001 counterpart 2: the partner ticker echoes only an origin the operator listed', async () => {
    const response = await get('/api/v1/partner/ticker', { origin: ORIGIN });

    expect(response.status).toBe(200);
    // Refused by the allowlist: this origin is not in PARTNER_ORIGINS, so
    // nothing about it is echoed.
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });
});

/**
 * Whether a header name is a security header, by the conventions the security
 * middleware of the platform follows (`x-*`, `cross-origin-*`, and the spelled
 * out policies). Derived on each answer rather than copied from any one
 * middleware's current set, so the comparison below survives an upgrade.
 */
function isSecurityHeader(name: string): boolean {
  return (
    name.startsWith('x-') ||
    name.startsWith('cross-origin-') ||
    [
      'content-security-policy',
      'permissions-policy',
      'referrer-policy',
      'strict-transport-security',
    ].includes(name)
  );
}

// CONFIG-002 — the public scope serves its pages with no security headers.
// Hardened value: no weaker public scope — helmet's headers on every answer
// the edge gives; the setting has no twin, so the counterparts are the two
// pages that carry them.
describe('CONFIG-002 — the public scope serves its pages with no security headers', () => {
  test('CONFIG-002: the public status page carries no CSP, no nosniff, no frame options', async () => {
    const response = await get('/api/v1/public/status');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    // What was gained: the page reaches a browser with nothing that constrains
    // what may be done with it — no CSP, no MIME pinning, no frame policy.
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBeNull();
    expect(response.headers.get('x-frame-options')).toBeNull();

    // The set is derived, not hand-kept: whatever security header the default
    // scope's answer carries, this scope's answer must not carry. A helmet
    // upgrade that adds a header then widens the comparison by itself, so the
    // public scope cannot drift toward safe without this test seeing it.
    const defaultScope = await get('/api/v1/health');
    const carried = [...defaultScope.headers.keys()].filter(isSecurityHeader);
    // The default answer does carry security headers for the comparison.
    expect(carried).toEqual(
      expect.arrayContaining([
        'content-security-policy',
        'x-content-type-options',
        'x-frame-options',
      ]),
    );
    for (const name of carried) {
      expect(response.headers.get(name)).toBeNull();
    }
  });

  test('CONFIG-002 counterpart 1: health answers with helmet on', async () => {
    const response = await get('/api/v1/health');

    expect(response.status).toBe(200);
    // Refused by the default scope's middleware: the same edge answers with
    // the full set of security headers when the route is not under the public
    // prefix.
    expect(response.headers.get('content-security-policy')).toBeDefined();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBeDefined();
  });

  test('CONFIG-002 counterpart 2: the status page sets the same headers by hand', async () => {
    const response = await get('/api/v1/status');

    expect(response.status).toBe(200);
    // Refused by the page itself: outside the public scope the same answer
    // carries the policies written by hand, whatever the middleware does.
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'self'",
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });
});

// CONFIG-003 — the API document, served with no authentication. Hardened
// value: the two guarded copies of the document and no open one.
describe('CONFIG-003 — the API document is served with no authentication', () => {
  test('CONFIG-003: the API pages answer with no token at all', async () => {
    const index = await get('/docs');
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toContain('href="/docs/json"');

    const document = await get('/docs/json');
    expect(document.status).toBe(200);
    const paths = Object.keys(
      ((await document.json()) as { paths: Record<string, unknown> }).paths,
    );
    // What was gained: the whole API surface — every route the running edge
    // carries, its methods and its schemas — read with no credential at all.
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/health',
        '/api/v1/auth/sign-in',
        '/api/v1/admin/users',
      ]),
    );
  });

  test('CONFIG-003 counterpart 1: the administrator document refuses a caller without the role', async () => {
    const refused = await get('/api/v1/admin/openapi.json');
    // Refused by the guard: the document is an administrator's, and this is nobody.
    expect(refused.status).toBe(401);

    const answered = await get('/api/v1/admin/openapi.json', {
      authorization: `Bearer ${tokenOf(lab, 'u-admin', 'ADMIN')}`,
    });
    expect(answered.status).toBe(200);
    expect(
      Object.keys(
        ((await answered.json()) as { paths: Record<string, unknown> }).paths,
      ),
    ).toContain('/api/v1/health');
  });

  test('CONFIG-003 counterpart 2: the service-token document refuses a caller without the token', async () => {
    const refused = await get('/api/v1/openapi.json');
    // Refused by the guard: only the system's own call reads this copy.
    expect(refused.status).toBe(401);

    const answered = await get('/api/v1/openapi.json', {
      'x-internal-token': lab().secrets.INTERNAL_SERVICE_TOKEN,
    });
    expect(answered.status).toBe(200);
  });
});

// CONFIG-004 — a debug endpoint answers the environment and the versions.
// Hardened value: no open debug route; what a person debugging needs is behind
// the administrator's guard and an allowlist of keys.
describe('CONFIG-004 — the debug page answers the environment and the versions', () => {
  test('CONFIG-004: the debug page answers environment values and dependency versions to anyone', async () => {
    const response = await get('/api/v1/debug');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      environment: Record<string, string>;
      dependencies: Record<string, string>;
      versions: { node?: string };
    };
    // What was gained: the run's own secret — the value of JWT_SECRET — plus
    // every other variable of the process, and the exact dependency versions
    // it runs on: enough to look for a known weakness in a known version.
    expect(body.environment.JWT_SECRET).toBe(lab().secrets.JWT_SECRET);
    expect(body.environment.INTERNAL_SERVICE_TOKEN).toBe(
      lab().secrets.INTERNAL_SERVICE_TOKEN,
    );
    expect(body.dependencies['@apollo/gateway']).toMatch(/^\d+/);
    expect(body.versions.node).toBeDefined();
  });

  test('CONFIG-004 counterpart 1: health answers a status and nothing else', async () => {
    const response = await get('/api/v1/health');

    expect(response.status).toBe(200);
    const text = await response.text();
    // Refused by the shape of the answer: a status page has no place for the
    // environment or a version to appear.
    expect(text).not.toContain(lab().secrets.JWT_SECRET);
    expect(
      (JSON.parse(text) as { versions?: unknown }).versions,
    ).toBeUndefined();
  });

  test('CONFIG-004 counterpart 2: the admin diagnostics page answers allowlisted keys only', async () => {
    const refused = await get('/api/v1/admin/diagnostics');
    // Refused by the guard: the page is an administrator's.
    expect(refused.status).toBe(401);

    const answered = await get('/api/v1/admin/diagnostics', {
      authorization: `Bearer ${tokenOf(lab, 'u-admin', 'ADMIN')}`,
    });
    expect(answered.status).toBe(200);
    const body = (await answered.json()) as {
      environment: Record<string, unknown>;
    };
    // Refused by the allowlist: a key not on it is never read, so its value
    // cannot leave the process.
    expect(Object.keys(body.environment)).not.toContain('JWT_SECRET');
    expect(JSON.stringify(body)).not.toContain(lab().secrets.JWT_SECRET);
  });
});
