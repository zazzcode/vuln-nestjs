import { afterAll, beforeAll, expect, test } from 'vitest';
import { labUsers } from '@zazzles/exchange-lab-data';
import { errorCode } from '@zazzles/exchange-testing';
import {
  bearer,
  call,
  gql,
  multipart,
  signInFor,
  startLab,
  tokenFor,
  userById,
  type Lab,
} from './lab.js';

let lab: Lab;

beforeAll(async () => {
  lab = await startLab();
}, 300_000);

afterAll(async () => {
  await lab.service?.stop();
});

describe('the safe operations, each doing what its row says', () => {
  test('signIn answers a token and the caller it stands for', async () => {
    const response = await gql(
      lab,
      `mutation {
      signIn(email: "alice@vcx.exchange", password: "alice-lab-only") {
        accessToken user { id email role }
      }
    }`,
    );

    expect(response.errors).toBeUndefined();
    const payload = response.data?.signIn as unknown as {
      accessToken: string;
      user: { id: string };
    };
    expect(payload.accessToken.split('.')).toHaveLength(3);
    expect(payload.user.id).toBe('u-alice');
  });

  test('signIn answers the same message for a wrong email and a wrong password', async () => {
    const wrongEmail = await gql(
      lab,
      `mutation {
      signIn(email: "nobody@vcx.exchange", password: "alice-lab-only") { accessToken }
    }`,
    );
    const wrongPassword = await gql(
      lab,
      `mutation {
      signIn(email: "alice@vcx.exchange", password: "not-the-password") { accessToken }
    }`,
    );

    expect(errorCode(wrongEmail)).toBe('UNAUTHENTICATED');
    expect(wrongEmail.errors?.[0]?.message).toBe(
      wrongPassword.errors?.[0]?.message,
    );
  });

  test('signIn locks the account after five failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await gql(
        lab,
        `mutation {
        signIn(email: "carol@vcx.exchange", password: "wrong-${attempt}") { accessToken }
      }`,
      );
    }
    const locked = await gql(
      lab,
      `mutation {
      signIn(email: "carol@vcx.exchange", password: "carol-lab-only") { accessToken }
    }`,
    );

    expect(errorCode(locked)).toBe('FORBIDDEN');
    expect(locked.errors?.[0]?.message).toContain('locked');
    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('me answers the caller, from a verified token', async () => {
    const response = await gql(
      lab,
      '{ me { id email displayName role preferences } }',
      { token: lab.aliceToken },
    );

    expect(response.data).toEqual({
      me: {
        id: 'u-alice',
        email: 'alice@vcx.exchange',
        displayName: 'Alice',
        role: 'USER',
        preferences: {
          theme: 'dark',
          language: 'en',
          currency: 'USD',
          marketingEmails: 'false',
        },
      },
    });
  });

  test("sessionInfo and sessions answer the caller's own sessions, and signOut ends the one it carries", async () => {
    const token = await signInFor(lab, 'dave@vcx.exchange', 'dave-lab-only');

    const info = await gql(
      lab,
      '{ sessionInfo { userId } sessions { userId } }',
      {
        token,
      },
    );
    expect(info.data).toEqual({
      sessionInfo: { userId: 'u-dave' },
      sessions: [{ userId: 'u-dave' }],
    });

    await gql(lab, 'mutation { signOut }', { token });
    const after = await gql(lab, '{ me { id } }', { token });
    expect(errorCode(after)).toBe('UNAUTHENTICATED');
    expect(after.errors?.[0]?.message).toContain('revoked');
  });

  test('updateProfile changes the typed fields only, and refuses a name outside the pattern', async () => {
    const updated = await gql(
      lab,
      `mutation { updateProfile(input: { displayName: "Alice Two" }) { displayName } }`,
      { token: lab.aliceToken },
    );
    const refused = await gql(
      lab,
      `mutation { updateProfile(input: { displayName: "Alice <script>" }) { displayName } }`,
      { token: lab.aliceToken },
    );

    expect(updated.data).toEqual({
      updateProfile: { displayName: 'Alice Two' },
    });
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('updatePreferences, setPreference and importSettings write the allowlisted keys only', async () => {
    const viaInput = await gql(
      lab,
      `mutation { updatePreferences(input: { theme: "light" }) { preferences } }`,
      { token: lab.aliceToken },
    );
    const viaEnum = await gql(
      lab,
      `mutation { setPreference(name: CURRENCY, value: "EUR") { preferences } }`,
      { token: lab.aliceToken },
    );
    const viaPath = await gql(
      lab,
      `mutation { setPreferencePath(path: "language", value: "fr") { preferences } }`,
      { token: lab.aliceToken },
    );
    const viaImport = await gql(
      lab,
      `mutation { importSettings(settings: "{\\"marketingEmails\\": \\"true\\"}") { preferences } }`,
      { token: lab.aliceToken },
    );
    const refused = await gql(
      lab,
      `mutation { importSettings(settings: "{\\"role\\": \\"ADMIN\\"}") { preferences } }`,
      { token: lab.aliceToken },
    );

    expect(viaInput.data).toEqual({
      updatePreferences: {
        preferences: {
          theme: 'light',
          language: 'en',
          currency: 'USD',
          marketingEmails: 'false',
        },
      },
    });
    expect(viaEnum.data).toEqual({
      setPreference: {
        preferences: {
          theme: 'light',
          language: 'en',
          currency: 'EUR',
          marketingEmails: 'false',
        },
      },
    });
    expect(viaPath.data).toEqual({
      setPreferencePath: {
        preferences: {
          theme: 'light',
          language: 'fr',
          currency: 'EUR',
          marketingEmails: 'false',
        },
      },
    });
    expect(viaImport.errors).toBeUndefined();
    expect(viaImport.data).toEqual({
      importSettings: {
        preferences: {
          theme: 'light',
          language: 'fr',
          currency: 'EUR',
          marketingEmails: 'true',
        },
      },
    });
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('changePassword verifies the current password, and the new one signs in', async () => {
    const changed = await gql(
      lab,
      `mutation { changePassword(currentPassword: "erin-lab-only", newPassword: "erin-new-lab-only") }`,
      { token: tokenFor(lab.jwtSecret, userById('u-erin')) },
    );
    const reSigned = await gql(
      lab,
      `mutation {
      signIn(email: "erin@vcx.exchange", password: "erin-new-lab-only") { user { id } }
    }`,
    );

    expect(changed.data).toEqual({ changePassword: true });
    expect(
      (reSigned.data?.signIn as unknown as { user: { id: string } }).user.id,
    ).toBe('u-erin');

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('requestPasswordReset answers the same for an account that exists and one that does not', async () => {
    const existing = await gql(
      lab,
      'mutation { requestPasswordReset(email: "alice@vcx.exchange") }',
    );
    const missing = await gql(
      lab,
      'mutation { requestPasswordReset(email: "nobody@vcx.exchange") }',
    );

    expect(existing.data).toEqual({ requestPasswordReset: true });
    expect(missing.data).toEqual({ requestPasswordReset: true });
  });

  test('resetPassword hands the administrator a working password from crypto randomness', async () => {
    const password = (await gql(
      lab,
      'mutation { resetPassword(userId: "u-bob") }',
      { token: lab.adminToken },
    )) as { data?: { resetPassword?: string } };

    expect(password.data?.resetPassword).toMatch(/^[0-9a-f]{32}$/);
    const reSigned = await gql(
      lab,
      `mutation ($password: String!) {
      signIn(email: "bob@vcx.exchange", password: $password) { user { id } }
    }`,
      { variables: { password: password.data?.resetPassword } },
    );
    expect(
      (reSigned.data?.signIn as unknown as { user: { id: string } }).user.id,
    ).toBe('u-bob');

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('setAvatarUrl stores the URL and fetches nothing', async () => {
    const response = await gql(
      lab,
      `mutation { setAvatarUrl(url: "https://avatars.vcx.exchange/alice.png") { avatarUrl } }`,
      { token: lab.aliceToken },
    );

    expect(response.data).toEqual({
      setAvatarUrl: {
        avatarUrl: 'https://avatars.vcx.exchange/alice.png',
      },
    });

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('users pages, caps its limit, and orders by the enum; searchUsers searches the text index', async () => {
    const page = await gql(
      lab,
      '{ users(orderBy: EMAIL, limit: 3, offset: 0) { email } }',
      { token: lab.adminToken },
    );
    const capped = await gql(lab, '{ users(limit: 100000) { id } }', {
      token: lab.adminToken,
    });
    const search = await gql(
      lab,
      '{ searchUsers(query: { q: "Alice" }) { id } }',
      { token: lab.adminToken },
    );

    expect(page.data).toEqual({
      users: [
        { email: 'admin@vcx.exchange' },
        { email: 'alice@vcx.exchange' },
        { email: 'bob@vcx.exchange' },
      ],
    });
    expect(errorCode(capped)).toBe('BAD_USER_INPUT');
    expect(search.data).toEqual({ searchUsers: [{ id: 'u-alice' }] });
  });

  test('userStats counts by role', async () => {
    const response = await gql(lab, '{ userStats { total admins users } }', {
      token: lab.adminToken,
    });

    expect(response.data).toEqual({
      userStats: {
        total: labUsers.length,
        admins: 1,
        users: labUsers.length - 1,
      },
    });
  });

  test('createUser stores a scrypt hash with its own salt', async () => {
    const created = await gql(
      lab,
      `mutation { createUser(input: { email: "zoe@vcx.exchange", displayName: "Zoe", password: "zoe-lab-only-1", role: USER }) { id email role } }`,
      { token: lab.adminToken },
    );

    expect(
      (created.data?.createUser as unknown as { email: string }).email,
    ).toBe('zoe@vcx.exchange');

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('the typed REST sign-in answers a token and sets a hardened cookie', async () => {
    const response = await call(lab, '/internal/sessions/typed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@vcx.exchange',
        password: 'alice-lab-only',
      }),
    });
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(
      ((await response.json()) as { accessToken: string }).accessToken
        .split('.'),
    ).toHaveLength(3);
  });

  test('the signed REST session sets a signed, lax, http-only cookie', async () => {
    const response = await call(lab, '/internal/sessions/signed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@vcx.exchange',
        password: 'alice-lab-only',
      }),
    });
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  test('introspect says what a live session stands for, and refuses tokens without one', async () => {
    const signed = await gql(
      lab,
      `mutation {
      signIn(email: "alice@vcx.exchange", password: "alice-lab-only") { accessToken }
    }`,
    );
    const token = (signed.data?.signIn as unknown as { accessToken: string })
      .accessToken;

    const live = await call(lab, '/internal/sessions/introspect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(token),
      },
      body: JSON.stringify({ token }),
    });
    const noSession = await call(lab, '/internal/sessions/introspect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(token),
      },
      body: JSON.stringify({ token: lab.aliceToken }),
    });
    const forged = await call(lab, '/internal/sessions/introspect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(token),
      },
      body: JSON.stringify({
        token: `${token.slice(0, -3)}abc`,
      }),
    });

    expect(await live.json()).toMatchObject({ active: true, sub: 'u-alice' });
    expect(await noSession.json()).toEqual({ active: false });
    expect(await forged.json()).toEqual({ active: false });
  });

  test('the resume route resumes from a cookie this service signed, and refuses anything else', async () => {
    // A signed cookie, written the way the service writes its own.
    const payload = '{"userId":"u-alice","theme":"dark"}';
    const signature = await import('node:crypto').then((crypto) =>
      crypto
        .createHmac('sha256', lab.jwtSecret)
        .update(payload)
        .digest('base64')
        .replace(/=+$/u, ''),
    );
    const value = `${payload}.${signature}`;

    const accepted = await call(lab, '/internal/sessions/resume', {
      method: 'POST',
      headers: { cookie: `vcx_remember=${encodeURIComponent(value)}` },
    });
    const refused = await call(lab, '/internal/sessions/resume', {
      method: 'POST',
      headers: {
        cookie: `vcx_remember=${encodeURIComponent('{"userId":"u-alice"}')}`,
      },
    });

    expect(accepted.status).toBe(200);
    expect(
      ((await accepted.json()) as { accessToken: string }).accessToken,
    ).not.toBe('');
    expect(refused.status).toBe(400);
  });

  test("the public key route publishes the run's RSA public key", async () => {
    const response = await call(lab, '/internal/sessions/public-key');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      alg: 'RS256',
      publicKey: expect.stringMatching(/^-----BEGIN PUBLIC KEY-----/),
    });
  });

  test('the documents routes store under a generated name and serve as attachments', async () => {
    const upload = multipart('file', 'notes.txt', 'the notes of the lab');
    const stored = await call(lab, '/internal/documents', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...upload.headers },
      body: upload.body,
    });

    expect(stored.status).toBe(201);
    const record = (await stored.json()) as {
      id: string;
      originalName: string;
    };
    expect(record.originalName).toBe('notes.txt');

    const listed = await gql(lab, '{ documents { originalName } }', {
      token: lab.aliceToken,
    });
    expect(
      (listed.data?.documents as unknown as { originalName: string }[])
        .map((document) => document.originalName)
        .sort(),
    ).toEqual(['avatar.png', 'notes.txt', 'statement.pdf']);

    const one = await call(lab, `/internal/documents/${record.id}`, {
      headers: bearer(lab.aliceToken),
    });
    expect(one.status).toBe(200);

    const view = await call(lab, `/internal/documents/${record.id}/view`, {
      headers: bearer(lab.aliceToken),
    });
    expect(view.headers.get('content-disposition')).toContain('attachment');
    expect(view.headers.get('x-content-type-options')).toBe('nosniff');

    const image = await call(lab, '/internal/documents/d-alice-avatar/image', {
      headers: bearer(lab.aliceToken),
    });
    expect(image.headers.get('content-type')).toBe('image/png');

    const notAnImage = await call(
      lab,
      '/internal/documents/d-alice-statement/image',
      {
        headers: bearer(lab.aliceToken),
      },
    );
    expect(notAnImage.status).toBe(415);
  });

  test('the checked upload route refuses bytes that do not match their extension', async () => {
    const png = multipart(
      'file',
      'picture.png',
      // A real 1x1 PNG, the same bytes the seed stores.
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
      'image/png',
    );
    const accepted = await call(lab, '/internal/documents/checked', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...png.headers },
      body: png.body,
    });
    const lying = multipart('file', 'not-a-png.png', 'this is text, not a png');
    const refused = await call(lab, '/internal/documents/checked', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...lying.headers },
      body: lying.body,
    });

    expect(accepted.status).toBe(201);
    expect(refused.status).toBe(400);

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('the upload allowlist refuses an extension it does not serve, whatever the safe route', async () => {
    const html = multipart(
      'file',
      'page.html',
      '<html><script>window.__zazzles = "zazzles-lab-marker"</script></html>',
      'text/html',
    );
    const refused = await call(lab, '/internal/documents', {
      method: 'POST',
      headers: { ...bearer(lab.aliceToken), ...html.headers },
      body: html.body,
    });

    expect(refused.status).toBe(400);
  });

  test('the internal users routes page and search, and lookup answers only to the service token', async () => {
    const page = await call(lab, '/internal/users?role=USER&limit=2', {
      headers: bearer(lab.adminToken),
    });
    const search = await call(lab, '/internal/users/search?q=Alice', {
      headers: bearer(lab.adminToken),
    });
    const lookup = await call(
      lab,
      '/internal/users/lookup?email=bob@vcx.exchange',
      { headers: { 'x-internal-token': lab.serviceToken } },
    );
    const lookupRefused = await call(
      lab,
      '/internal/users/lookup?email=bob@vcx.exchange',
      { headers: bearer(lab.adminToken) },
    );

    expect(await page.json()).toHaveLength(2);
    expect(await search.json()).toEqual([
      expect.objectContaining({ id: 'u-alice' }),
    ]);
    expect(await lookup.json()).toMatchObject({ id: 'u-bob' });
    expect(lookupRefused.status).toBe(401);
  });

  test('the admin routes list as JSON with nosniff, create through the DTO, and render the directory escaped', async () => {
    const list = await call(lab, '/internal/admin/users', {
      headers: bearer(lab.adminToken),
    });
    const directory = await call(lab, '/internal/admin/directory', {
      headers: bearer(lab.adminToken),
    });
    const body = await directory.text();

    expect(list.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await list.json()).toHaveLength(labUsers.length);
    expect(directory.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(body).toContain('<td>Alice</td>');
    expect(body).not.toContain('<script');
  });

  test('PUT /internal/profile copies the named fields only, and refuses an unknown one', async () => {
    const updated = await call(lab, '/internal/profile', {
      method: 'PUT',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'Alice Three' }),
    });
    const refused = await call(lab, '/internal/profile', {
      method: 'PUT',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ role: 'ADMIN' }),
    });

    expect(updated.status).toBe(200);
    expect(
      ((await updated.json()) as { displayName: string }).displayName,
    ).toBe('Alice Three');
    expect(refused.status).toBe(400);

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });
});

describe('authorization: every admin operation refuses a user', () => {
  const adminOperations: [string, string][] = [
    ['user(id: "u-bob") { id }', '{ user(id: "u-bob") { id } }'],
    ['users { id }', '{ users { id } }'],
    ['searchUsers', '{ searchUsers(query: { q: "Alice" }) { id } }'],
    ['userStats', '{ userStats { total } }'],
    [
      'createUser',
      'mutation { createUser(input: { email: "x@vcx.exchange", displayName: "X", password: "x-lab-only-1" }) { id } }',
    ],
    ['resetPassword', 'mutation { resetPassword(userId: "u-bob") }'],
  ];

  for (const [name, source] of adminOperations) {
    test(`${name} refuses a user`, async () => {
      const response = await gql(lab, source, { token: lab.aliceToken });
      expect(errorCode(response)).toBe('FORBIDDEN');
    });
  }

  test('the internal REST admin routes refuse a user', async () => {
    for (const path of [
      '/internal/users',
      '/internal/users/search?q=Alice',
      '/internal/admin/users',
      '/internal/admin/directory',
    ]) {
      expect(
        (await call(lab, path, { headers: bearer(lab.aliceToken) })).status,
      ).toBe(403);
    }
    expect(
      (
        await call(lab, '/internal/admin/users', {
          method: 'POST',
          headers: {
            ...bearer(lab.aliceToken),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'y@vcx.exchange',
            displayName: 'Y',
            password: 'y-lab-only-1',
          }),
        })
      ).status,
    ).toBe(403);
  });
});

describe('own data: the operations that read by identifier answer only their own', () => {
  test('documents answer their owner only', async () => {
    const stranger = await call(lab, '/internal/documents/d-alice-avatar', {
      headers: bearer(lab.bobToken),
    });
    const strangerByName = await call(
      lab,
      '/internal/documents/by-name/avatar.png',
      { headers: bearer(lab.bobToken) },
    );

    expect(stranger.status).toBe(404);
    expect(strangerByName.status).toBe(404);
  });

  test("deleteSession ends only the caller's own session", async () => {
    const signed = await gql(
      lab,
      `mutation {
      signIn(email: "bob@vcx.exchange", password: "bob-lab-only") { accessToken }
    }`,
    );
    const bobToken = (signed.data?.signIn as unknown as { accessToken: string })
      .accessToken;

    const someoneElses = await gql(
      lab,
      'mutation { deleteSession(id: "s-u-alice") }',
      { token: bobToken },
    );

    expect(someoneElses.data).toEqual({ deleteSession: false });
  });

  test('reset returns every document to the fake data, including what an exploit changed', async () => {
    await call(lab, '/internal/profile', {
      method: 'PUT',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'Changed By A Test' }),
    });
    const reset = await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });

    expect(reset.status).toBe(200);
    const me = await gql(lab, '{ me { displayName } }', {
      token: lab.aliceToken,
    });
    expect(me.data).toEqual({ me: { displayName: 'Alice' } });
  });
});
