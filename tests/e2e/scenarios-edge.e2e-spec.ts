import { request } from '@zazzles/exchange-testing';
import { useLab } from './lab.js';
import { tokenOf } from './scenarios.js';

/**
 * The edge scenarios against the real lab: the open redirect (REDIR-001), the
 * reflected markup (XSS-003), the cookie-authenticated preference change
 * (COOKIE-003), and the error that is not masked (INFO-002). One payload, sent
 * to the vulnerable endpoint and to each protected counterpart of its row.
 *
 * The tests that take the lab apart — INFO-002 with trading gone — run last:
 * nothing after them may need a service that has been stopped.
 */
const lab = useLab();

/** One request to the gateway, which every client reaches over HTTP/1.1. */
const call = (path: string, init: RequestInit = {}) =>
  request(`${lab().url}${path}`, init);

// REDIR-001 — the caller's next is the redirect target, wherever it points.
// Hardened value: a target the edge chooses itself — a fixed relative path, or
// an origin the operator listed.
describe('REDIR-001 — the redirect follows next off-site', () => {
  // One payload: a next pointing at an origin no operator listed. Nothing
  // listens on 4010; the redirect is what is asserted, not the landing.
  const NEXT = '?next=http%3A%2F%2F127.0.0.1%3A4010%2Flanding';

  // Newman follows redirects and a browser would too; the 302 and its target
  // are read here without following them.
  const alice = () => tokenOf(lab, 'u-alice');

  test('REDIR-001: the redirect follows next off-site', async () => {
    const response = await call(`/api/v1/auth/redirect${NEXT}`, {
      headers: { authorization: `Bearer ${alice()}` },
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    // What was gained: the caller is carried off-site, to an origin no
    // operator listed, by a link this edge signed.
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:4010/landing',
    );
  });

  test('REDIR-001 counterpart 1: continue redirects to a fixed relative path', async () => {
    const response = await call(`/api/v1/auth/continue${NEXT}`, {
      headers: { authorization: `Bearer ${alice()}` },
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    // Refused by the fixed target: the same `next` is not read, and a
    // relative path cannot leave the edge.
    expect(response.headers.get('location')).toBe('/api/v1/status');
  });

  test('REDIR-001 counterpart 2: continue-allowlisted does not follow an unlisted origin', async () => {
    const response = await call(`/api/v1/auth/continue-allowlisted${NEXT}`, {
      headers: { authorization: `Bearer ${alice()}` },
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    // Refused by the allowlist: the origin of `next` is not in
    // REDIRECT_ORIGINS, so the caller lands on the fixed path instead.
    expect(response.headers.get('location')).toBe('/api/v1/status');
    expect(response.headers.get('location')).not.toContain('4010');
  });
});

// XSS-003 — the caller's name is written into the page as it arrived.
// Hardened value: a template that escapes what it shows; the two counterparts
// are the same page outside the public scope and its JSON form.
describe('XSS-003 — the public status page serves the name unescaped', () => {
  // One payload: the lab's marker, as the name a caller sends.
  const MARKER =
    '<img src=x onerror="window.__zazzles=\'zazzles-lab-marker\'">';
  const NAMED = `?name=${encodeURIComponent(MARKER)}`;

  test('XSS-003: the public status page serves the name unescaped, as text/html', async () => {
    const response = await call(`/api/v1/public/status${NAMED}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    // What was gained: the marker is served as markup, in a page with no CSP —
    // a browser that opens the link runs the script the caller sent.
    const page = await response.text();
    expect(page).toContain(MARKER);
    expect(page).not.toContain('&lt;img');
  });

  test('XSS-003 counterpart 1: the default-scope status page escapes the same name', async () => {
    const response = await call(`/api/v1/status${NAMED}`);

    expect(response.status).toBe(200);
    // Refused by the template: the same name arrives as data, escaped, in a
    // page that also carries a CSP.
    const page = await response.text();
    expect(page).not.toContain(MARKER);
    expect(page).toContain('&lt;img src=x');
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'self'",
    );
  });

  test('XSS-003 counterpart 2: status.json answers JSON with nosniff', async () => {
    const response = await call(`/api/v1/status.json${NAMED}`);

    expect(response.status).toBe(200);
    // Refused twice over: JSON is not a document to run markup in, and
    // `nosniff` keeps a browser from reading it as one.
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(((await response.json()) as { caller: string }).caller).toBe(MARKER);
  });
});
