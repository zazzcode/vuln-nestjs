import { graphql, request } from '@zazzles/exchange-testing';
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

// COOKIE-003 — a state change a page on another site can submit. Hardened
// value: the two routes that ask for what a cross-site form cannot send.
describe('COOKIE-003 — a form post with the session cookie changes the profile', () => {
  // One payload: the form a page on another site submits — a field the real
  // profile accepts — and nothing but the cookie the browser adds to it.
  const FORM = 'displayName=Cross+site+change';
  const alice = () => tokenOf(lab, 'u-alice');

  /** The cross-site form itself: the cookie, the urlencoded body, nothing else. */
  const postForm = (path: string, headers: Record<string, string> = {}) =>
    call(path, {
      method: 'POST',
      headers: {
        cookie: `vcx_session=${alice()}`,
        'content-type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: FORM,
    });

  /** Alice's display name, as the gateway's own graph reads it from accounts. */
  const displayName = async (): Promise<string> => {
    const read = await graphql(
      `${lab().url}/graphql`,
      '{ me { displayName } }',
      {
        token: alice(),
      },
    );
    expect(read.errors).toBeUndefined();
    return (read.data as { me: { displayName: string } }).me.displayName;
  };

  test('COOKIE-003: a form post with the session cookie changes the profile', async () => {
    const response = await postForm('/api/v1/profile/preferences');

    expect(response.status).toBe(200);
    // What was gained: the change crossed to the real profile in accounts —
    // written from nothing but a form a browser submits and the cookie it
    // adds — and the gateway's own graph reads the new name back.
    expect(await displayName()).toBe('Cross site change');

    // The lab is returned to its fake data for what follows in this file.
    await call('/api/v1/lab/reset', { method: 'POST' });
    expect(await displayName()).toBe('Alice');
  });

  test('COOKIE-003 counterpart 1: preferences/json wants a bearer header and a JSON body', async () => {
    const unauthenticated = await postForm('/api/v1/profile/preferences/json');
    // Refused by what a cross-site form cannot send: no bearer header to
    // carry, so the cookie alone is not taken for the caller.
    expect(unauthenticated.status).toBe(401);

    const form = await call('/api/v1/profile/preferences/json', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${alice()}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: FORM,
    });
    // And the body a form does send is not the JSON the route carries.
    expect(form.status).toBe(415);
    expect(await displayName()).toBe('Alice');
  });

  test('COOKIE-003 counterpart 2: preferences/csrf refuses the same post without its token', async () => {
    const response = await postForm('/api/v1/profile/preferences/csrf');

    // Refused by the CSRF check: a cookie alone is a request a page on
    // another site can arrange; the token it cannot also add is missing, and
    // nothing is carried to the profile.
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('csrf');
    expect(await displayName()).toBe('Alice');
  });
});

// INFO-002 — the same failure, answered three ways: returned in full by the
// public diagnostics page, masked by the markets ticker, given a request id
// and a logged stack by the partner ticker. Hardened value: no page that
// returns a failure — the masked sentence and the logged stack.
//
// This block takes the lab apart — trading is stopped for it, which is the
// failure — so it runs last in the file: nothing after it may need a service
// that is gone. What a stopped lab cannot show stays in the service's own
// tests: the stack written to the server's log is asserted there, in
// process; here it is the answers the running lab gives that are asserted.
describe('INFO-002 — the failure itself returned, with trading gone', () => {
  test('INFO-002: the public diagnostics returns the failure itself, message and stack', async () => {
    await lab().stopService('trading');

    const response = await call('/api/v1/public/diagnostics');

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      error?: unknown;
      stack?: unknown;
    };
    // What was gained: why trading failed and the stack of the call that
    // failed, in the answer, for anyone who asks and with no credential.
    expect(String(body.error)).toContain('trading is unreachable');
    expect(String(body.stack)).toContain('trading is unreachable');
    expect(String(body.stack)).toContain(' at ');
  });

  test('INFO-002 counterpart 1: the markets ticker answers one masked sentence', async () => {
    const response = await call('/api/v1/markets/ticker');

    expect(response.status).toBe(503);
    // Refused by the mask: the same failure is one sentence about the
    // ticker, with neither the reason nor any stack in the answer.
    const text = await response.text();
    expect((JSON.parse(text) as { message: string }).message).toBe(
      'the ticker is unavailable',
    );
    expect(text).not.toContain('unreachable');
    expect(text).not.toContain('stack');
  });

  test('INFO-002 counterpart 2: the partner ticker answers a request id, not the failure', async () => {
    const response = await call('/api/v1/partner/ticker');

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      error?: string;
      requestId?: string;
    };
    // Refused by the handler: the same failure is one sentence and a request
    // id to quote; the stack was written to the server's log, not the answer.
    expect(body.error).toBe('the ticker is unavailable');
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const text = JSON.stringify(body);
    expect(text).not.toContain('unreachable');
    expect(text).not.toContain('stack');
  });

  // What the running lab answers when a service behind it is gone: the
  // pass-through carries the failure in the lab's error shape, naming the
  // service that did not answer, and health reports it unavailable.
  test('the lab with trading gone: a pass-through route answers 503 naming trading', async () => {
    const response = await call('/api/v1/reports', {
      headers: { authorization: `Bearer ${tokenOf(lab, 'u-alice')}` },
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      statusCode?: number;
      message?: string;
      error?: string;
    };
    expect(body.statusCode).toBe(503);
    expect(body.message).toMatch(/trading/);
    expect(body.message).toContain('trading is unreachable');
    expect(body.error).toBe('Service Unavailable');
  });

  test('the lab with trading gone: health answers 503 with trading unavailable', async () => {
    const response = await call('/api/v1/health');

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: 'unavailable',
      services: {
        accounts: { status: 'ok' },
        trading: { status: 'unavailable', service: 'trading' },
        notifications: { status: 'ok' },
      },
    });
  });
});
