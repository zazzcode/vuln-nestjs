import { request } from '@zazzles/exchange-testing';
import { useLab } from './lab.js';

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
