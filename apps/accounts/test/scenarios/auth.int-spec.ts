import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { errorCode } from '@zazzles/exchange-testing';
import jwt from 'jsonwebtoken';
import { bearer, call, gql, signInFor, startLab, type Lab } from '../lab.js';
import { LEGACY_FALLBACK_SECRET } from '../../src/legacy/legacy-token.guard.js';

let lab: Lab;
let publicKey = '';

beforeAll(async () => {
  lab = await startLab();
  const published = (await (
    await call(lab, '/internal/sessions/public-key')
  ).json()) as { publicKey: string };
  publicKey = published.publicKey;
}, 300_000);

afterAll(async () => {
  await lab.service?.stop();
});

const legacyTokenFor = (
  secret: string,
  claims: { sub: string; role: 'ADMIN' | 'USER' },
): string =>
  jwt.sign(
    { sub: claims.sub, sid: `forged-${claims.sub}`, role: claims.role },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: '12h',
    },
  );

const unsignedTokenFor = (claims: Record<string, unknown>): string => {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none', typ: 'JWT' })}.${part(claims)}.`;
};

describe('AUTH-001: a token signed with the public key as an HMAC secret is accepted', () => {
  const payload = () =>
    legacyTokenFor(publicKey, { sub: 'u-admin', role: 'ADMIN' });

  test('whoAmI answers the administrator, hash included', async () => {
    const exploited = await gql(
      lab,
      '{ whoAmI { id email role passwordHash } }',
      { token: payload() },
    );

    // gained: the administrator's record, with no administrator's secret
    expect(exploited.data).toEqual({
      whoAmI: {
        id: 'u-admin',
        email: 'admin@vcx.exchange',
        role: 'ADMIN',
        passwordHash: expect.stringMatching(/^scrypt\$16384\$8\$1\$/),
      },
    });
  });

  test('me refuses the same token: the algorithm is pinned', async () => {
    const refused = await gql(lab, '{ me { id } }', { token: payload() });
    expect(errorCode(refused)).toBe('UNAUTHENTICATED');
  });

  test('sessionInfo refuses the same token: JwtModule is configured the same way', async () => {
    const refused = await gql(lab, '{ sessionInfo { id } }', {
      token: payload(),
    });
    expect(errorCode(refused)).toBe('UNAUTHENTICATED');
  });
});

describe('AUTH-002: a decoded token is treated as proof', () => {
  const payload = () =>
    unsignedTokenFor({ sub: 'u-admin', sid: 's-x', role: 'ADMIN' });

  test('GET /internal/sessions/decoded answers the administrator it claims', async () => {
    const response = await call(lab, '/internal/sessions/decoded', {
      headers: bearer(payload()),
    });

    // gained: the administrator's identity, from a token with no signature at all
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'u-admin',
      email: 'admin@vcx.exchange',
      role: 'ADMIN',
    });
  });

  test('me refuses the same token: the signature is verified', async () => {
    const refused = await gql(lab, '{ me { id } }', { token: payload() });
    expect(errorCode(refused)).toBe('UNAUTHENTICATED');
  });

  test('introspect says the same token is not active: signature and session decide', async () => {
    const response = await call(lab, '/internal/sessions/introspect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(lab.aliceToken),
      },
      body: JSON.stringify({ token: payload() }),
    });
    expect(await response.json()).toEqual({ active: false });
  });
});

describe('AUTH-003: no lockout on the quick alias', () => {
  test('quickSignIn answers a token after five wrong passwords, and logs the password', async () => {
    const spy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await gql(
        lab,
        `mutation {
        quickSignIn(email: "carol@vcx.exchange", password: "wrong-${attempt}") { accessToken }
      }`,
      );
    }
    const exploited = await gql(
      lab,
      `mutation {
      quickSignIn(email: "carol@vcx.exchange", password: "carol-lab-only") { accessToken user { id } }
    }`,
    );

    // gained: a token on the sixth attempt, and the password in the log
    expect(exploited.errors).toBeUndefined();
    const logged = spy.mock.calls.map((call) => call.join(' ')).join('\n');
    spy.mockRestore();
    expect(logged).toContain('carol-lab-only');
  });

  test('signIn locks the account after the same five failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await gql(
        lab,
        `mutation {
        signIn(email: "carol@vcx.exchange", password: "wrong-${attempt}") { accessToken }
      }`,
      );
    }
    const refused = await gql(
      lab,
      `mutation {
      signIn(email: "carol@vcx.exchange", password: "carol-lab-only") { accessToken }
    }`,
    );

    // refused: the account is locked, the correct password changes nothing
    expect(errorCode(refused)).toBe('FORBIDDEN');
    expect(refused.errors?.[0]?.message).toContain('locked');
  });
});

describe('AUTH-004: the legacy sign-out revokes nothing', () => {
  test('the token still works after signOutLegacy answers', async () => {
    const token = await signInFor(lab, 'dave@vcx.exchange', 'dave-lab-only');
    const answered = await gql(lab, 'mutation { signOutLegacy }', { token });
    const stillValid = await gql(lab, '{ me { id } }', { token });

    // gained: a "signed out" answer and a token that still authenticates
    expect(answered.data).toEqual({ signOutLegacy: true });
    expect(stillValid.data).toEqual({ me: { id: 'u-dave' } });
  });

  test('signOut ends the session the token carries, and the guard checks', async () => {
    const token = await signInFor(lab, 'dave@vcx.exchange', 'dave-lab-only');
    await gql(lab, 'mutation { signOut }', { token });
    const refused = await gql(lab, '{ me { id } }', { token });

    // refused: the session is revoked
    expect(errorCode(refused)).toBe('UNAUTHENTICATED');
    expect(refused.errors?.[0]?.message).toContain('revoked');
  });

  test('POST /internal/sessions/revoke does the same over REST, and clears the cookie', async () => {
    const token = await signInFor(lab, 'dave@vcx.exchange', 'dave-lab-only');
    const revoked = await call(lab, '/internal/sessions/revoke', {
      method: 'POST',
      headers: bearer(token),
    });
    const refused = await gql(lab, '{ me { id } }', { token });

    expect(await revoked.json()).toEqual({ revoked: true });
    expect(revoked.headers.get('set-cookie')).toContain('vcx_session');
    expect(errorCode(refused)).toBe('UNAUTHENTICATED');
  });
});

describe('AUTH-005: the answer differs for an account that exists', () => {
  test('checkAccount tells an existing account from a missing one', async () => {
    const existing = await gql(
      lab,
      'query { checkAccount(email: "alice@vcx.exchange") }',
    );
    const missing = await gql(
      lab,
      'query { checkAccount(email: "nobody@vcx.exchange") }',
    );

    // gained: account enumeration, one call each
    expect(existing.data).toEqual({ checkAccount: true });
    expect(missing.data).toEqual({ checkAccount: false });
  });

  test('requestPasswordReset answers the same whether or not the account exists', async () => {
    const existing = await gql(
      lab,
      'mutation { requestPasswordReset(email: "alice@vcx.exchange") }',
    );
    const missing = await gql(
      lab,
      'mutation { requestPasswordReset(email: "nobody@vcx.exchange") }',
    );

    expect(JSON.stringify(existing.data)).toBe(JSON.stringify(missing.data));
  });

  test('signIn says the same thing for a wrong email and a wrong password', async () => {
    const wrongEmail = await gql(
      lab,
      'mutation { signIn(email: "nobody@vcx.exchange", password: "alice-lab-only") { accessToken } }',
    );
    const wrongPassword = await gql(
      lab,
      'mutation { signIn(email: "alice@vcx.exchange", password: "wrong") { accessToken } }',
    );

    expect(wrongEmail.errors?.[0]?.message).toBe(
      wrongPassword.errors?.[0]?.message,
    );
  });
});

describe('CRYPTO-001: the sign-up of the old client stores an unsalted SHA-1', () => {
  test('two sign-ups with one password store the same hash', async () => {
    const first = await gql(
      lab,
      `mutation { signUp(email: "one@vcx.exchange", password: "shared-lab-only", displayName: "One") { user { id } } }`,
    );
    const second = await gql(
      lab,
      `mutation { signUp(email: "two@vcx.exchange", password: "shared-lab-only", displayName: "Two") { user { id } } }`,
    );

    // gained: one digest for every caller of the same password. The stored
    // hashes, read through the store the service itself uses:
    expect(first.errors).toBeUndefined();
    expect(second.errors).toBeUndefined();
    const users = lab.service.app.get('MONGO_DATABASE').collection('users');
    const stored = await users
      .find({ email: { $in: ['one@vcx.exchange', 'two@vcx.exchange'] } })
      .toArray();
    expect(
      stored.map((document: { passwordHash: string }) => document.passwordHash),
    ).toEqual([stored[0]?.passwordHash, stored[0]?.passwordHash]);
    expect(stored[0]?.passwordHash).toMatch(/^\$sha1\$[0-9a-f]{40}$/);
  });

  test('createUser salts every hash: the same password, two hashes', async () => {
    await gql(
      lab,
      `mutation { createUser(input: { email: "three@vcx.exchange", displayName: "Three", password: "shared-lab-only" }) { id } }`,
      { token: lab.adminToken },
    );
    await gql(
      lab,
      `mutation { createUser(input: { email: "four@vcx.exchange", displayName: "Four", password: "shared-lab-only" }) { id } }`,
      { token: lab.adminToken },
    );

    const users = lab.service.app.get('MONGO_DATABASE').collection('users');
    const stored = await users
      .find({ email: { $in: ['three@vcx.exchange', 'four@vcx.exchange'] } })
      .toArray();
    expect(stored).toHaveLength(2);
    expect(stored[0].passwordHash).not.toBe(stored[1].passwordHash);
    expect(stored[0].passwordHash).toMatch(/^scrypt\$16384\$8\$1\$/);
  });

  test('POST /internal/admin/users salts too, through the DTO', async () => {
    const response = await call(lab, '/internal/admin/users', {
      method: 'POST',
      headers: {
        ...bearer(lab.adminToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'five@vcx.exchange',
        displayName: 'Five',
        password: 'shared-lab-only',
      }),
    });
    expect(response.status).toBe(201);

    const users = lab.service.app.get('MONGO_DATABASE').collection('users');
    const stored = await users
      .find({ email: { $in: ['four@vcx.exchange', 'five@vcx.exchange'] } })
      .toArray();
    expect(stored[0]?.passwordHash).not.toBe(stored[1]?.passwordHash);
  });
});

describe('CRYPTO-002: the recovery code of the old client comes from Math.random', () => {
  test('the code is what Math.random makes it', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    const code = await gql(
      lab,
      'mutation { recoverPassword(email: "alice@vcx.exchange") }',
    );
    random.mockRestore();

    // gained: the reset code, predicted from the randomness's source
    expect(code.data).toEqual({ recoverPassword: '420000' });
  });

  test('requestPasswordReset returns no code at all, the same answer for both cases', async () => {
    const existing = await gql(
      lab,
      'mutation { requestPasswordReset(email: "alice@vcx.exchange") }',
    );
    expect(JSON.stringify(existing.data)).toBe(
      JSON.stringify({ requestPasswordReset: true }),
    );
  });

  test('resetPassword hands out crypto-random material', async () => {
    const first = await gql(
      lab,
      'mutation { resetPassword(userId: "u-bob") }',
      {
        token: lab.adminToken,
      },
    );
    const second = await gql(
      lab,
      'mutation { resetPassword(userId: "u-bob") }',
      {
        token: lab.adminToken,
      },
    );
    const a = (first.data ?? { resetPassword: '' }) as {
      resetPassword: string;
    };
    const b = (second.data ?? { resetPassword: '' }) as {
      resetPassword: string;
    };

    expect(a.resetPassword).toMatch(/^[0-9a-f]{32}$/);
    expect(a.resetPassword).not.toBe(b.resetPassword);
  });
});

describe('CRYPTO-003: the committed fallback secret verifies tokens', () => {
  const payload = () =>
    legacyTokenFor(LEGACY_FALLBACK_SECRET, { sub: 'u-admin', role: 'ADMIN' });

  test('whoAmI answers the administrator for a token signed with the committed secret', async () => {
    const exploited = await gql(lab, '{ whoAmI { id role passwordHash } }', {
      token: payload(),
    });

    // gained: the administrator's record, with no secret of this run
    expect(exploited.data).toEqual({
      whoAmI: {
        id: 'u-admin',
        role: 'ADMIN',
        passwordHash: expect.stringMatching(/^scrypt\$16384\$8\$1\$/),
      },
    });
  });

  test('me refuses the same token: the guard reads a validated configuration', async () => {
    const refused = await gql(lab, '{ me { id } }', { token: payload() });
    expect(errorCode(refused)).toBe('UNAUTHENTICATED');
  });

  test('sessionInfo refuses it too, from the same configured JwtModule', async () => {
    const refused = await gql(lab, '{ sessionInfo { id } }', {
      token: payload(),
    });
    expect(errorCode(refused)).toBe('UNAUTHENTICATED');
  });
});

describe('COOKIE-001: the token cookie is set without HttpOnly', () => {
  test('POST /internal/sessions/token answers a cookie a script can read', async () => {
    const response = await call(lab, '/internal/sessions/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@vcx.exchange',
        password: 'alice-lab-only',
      }),
    });
    const cookie = response.headers.get('set-cookie') ?? '';

    // gained: the token itself sits in a cookie without HttpOnly
    expect(response.status).toBe(200);
    expect(cookie).toContain('vcx_session=');
    expect(cookie).not.toContain('HttpOnly');
    const token = ((await response.json()) as { accessToken: string })
      .accessToken;
    expect(cookie).toContain(token.slice(0, 20));
  });

  test('the typed sign-in sets HttpOnly and SameSite=Strict', async () => {
    const response = await call(lab, '/internal/sessions/typed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@vcx.exchange',
        password: 'alice-lab-only',
      }),
    });
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  test('the signed session sets a signed, HttpOnly, lax cookie', async () => {
    const response = await call(lab, '/internal/sessions/signed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@vcx.exchange',
        password: 'alice-lab-only',
      }),
    });
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });
});

describe('COOKIE-002: the remember cookie lives thirty days with no SameSite', () => {
  test('POST /internal/sessions/remember answers a month-long cookie', async () => {
    const response = await call(lab, '/internal/sessions/remember', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@vcx.exchange',
        password: 'alice-lab-only',
      }),
    });
    const cookie = response.headers.get('set-cookie') ?? '';

    // gained: a session cookie that any site's request carries
    expect(response.status).toBe(200);
    expect(cookie).toMatch(/max-age=2592000/i);
    expect(cookie).not.toContain('SameSite');
  });

  test('both counterparts answer cookies with SameSite set', async () => {
    for (const path of [
      '/internal/sessions/typed',
      '/internal/sessions/signed',
    ]) {
      const response = await call(lab, path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'alice@vcx.exchange',
          password: 'alice-lab-only',
        }),
      });
      expect(response.headers.get('set-cookie')).toContain('SameSite=');
    }
  });
});

describe('DESER-001: the remember cookie goes to node-serialize', () => {
  const cookie = () =>
    'vcx_remember={"userId":"u-alice","theme":"_$$ND_FUNC$$_function(){return \'zazzles-lab-marker\'}()"}';

  test('the function in the cookie runs in the service', async () => {
    const response = await call(lab, '/internal/sessions/resume-legacy', {
      method: 'POST',
      headers: { cookie: cookie() },
    });

    // gained: code execution — the theme is what the function returned
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'resumed',
      userId: 'u-alice',
      theme: 'zazzles-lab-marker',
    });
  });

  test('the signed resume route refuses the same cookie: the signature is checked first', async () => {
    const response = await call(lab, '/internal/sessions/resume', {
      method: 'POST',
      headers: { cookie: cookie() },
    });
    expect(response.status).toBe(400);
  });

  test('introspect lets the session record decide, not the cookie', async () => {
    const token = await signInFor(lab, 'alice@vcx.exchange', 'alice-lab-only');
    await call(lab, '/internal/sessions/revoke', {
      method: 'POST',
      headers: bearer(token),
    });
    const response = await call(lab, '/internal/sessions/introspect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(lab.aliceToken),
      },
      body: JSON.stringify({ token }),
    });
    expect(await response.json()).toEqual({ active: false });
  });
});

describe('INFO-001: the password and the token reach the log', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('POST /internal/sessions/token logs the password and the token', async () => {
    const spy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    await call(lab, '/internal/sessions/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'erin@vcx.exchange',
        password: 'erin-lab-only',
      }),
    });
    const logged = spy.mock.calls.map((entry) => entry.join(' ')).join('\n');
    spy.mockRestore();

    // gained: the password and the token, in the log
    expect(logged).toContain('erin-lab-only');
    expect(logged).toContain('eyJ');
  });

  test('signIn logs the user id only', async () => {
    const spy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    await gql(
      lab,
      `mutation {
      signIn(email: "erin@vcx.exchange", password: "erin-lab-only") { accessToken }
    }`,
    );
    const logged = spy.mock.calls.map((entry) => entry.join(' ')).join('\n');
    spy.mockRestore();

    expect(logged).not.toContain('erin-lab-only');
  });

  test('the typed sign-in redacts named fields on the way to the logger', async () => {
    const spy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    await call(lab, '/internal/sessions/typed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'erin@vcx.exchange',
        password: 'erin-lab-only',
      }),
    });
    const logged = spy.mock.calls.map((entry) => entry.join(' ')).join('\n');
    spy.mockRestore();

    expect(logged).toContain('erin@vcx.exchange');
    expect(logged).not.toContain('erin-lab-only');
  });
});

describe('GQL-005: the password hash is a field of the record', () => {
  const payload = () =>
    legacyTokenFor(publicKey, { sub: 'u-alice', role: 'USER' });

  test("whoAmI returns the caller's stored hash", async () => {
    const exploited = await gql(lab, '{ whoAmI { id passwordHash } }', {
      token: payload(),
    });

    // gained: the scrypt hash of Alice's password
    expect(exploited.data).toEqual({
      whoAmI: {
        id: 'u-alice',
        passwordHash: expect.stringMatching(/^scrypt\$16384\$8\$1\$/),
      },
    });
  });

  test('me has no such field to ask for', async () => {
    const refused = await gql(lab, '{ me { passwordHash } }', {
      token: lab.aliceToken,
    });

    // refused: User does not carry the hash, so the query never runs
    expect(errorCode(refused)).toBe('GRAPHQL_VALIDATION_FAILED');
  });

  test('user(id) is admin-only, and its User has no such field either', async () => {
    const asUser = await gql(lab, '{ user(id: "u-alice") { id } }', {
      token: lab.aliceToken,
    });
    const asAdmin = await gql(lab, '{ user(id: "u-alice") { passwordHash } }', {
      token: lab.adminToken,
    });

    expect(errorCode(asUser)).toBe('FORBIDDEN');
    expect(errorCode(asAdmin)).toBe('GRAPHQL_VALIDATION_FAILED');
  });
});
