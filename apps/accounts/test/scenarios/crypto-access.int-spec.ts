import { afterAll, beforeAll, expect, test } from 'vitest';
import { errorCode } from '@zazzles/exchange-testing';
import { bearer, call, gql, startLab, type Lab } from '../lab.js';

let lab: Lab;

beforeAll(async () => {
  lab = await startLab();
}, 300_000);

afterAll(async () => {
  await lab.service?.stop();
});

describe('ACCESS-001: another account by identifier, with no ownership check', () => {
  test("userPreferences answers Bob's email and preferences to Alice's token", async () => {
    const response = await gql(
      lab,
      'query ($userId: ID!) { userPreferences(userId: $userId) }',
      { token: lab.aliceToken, variables: { userId: 'u-bob' } },
    );
    const answered = response.data?.userPreferences as {
      email: string;
      preferences: Record<string, string>;
    };

    // gained: another account's email and preferences, asked for by id
    expect(answered.email).toBe('bob@vcx.exchange');
    expect(answered.preferences.theme).toBe('dark');
  });

  test('me answers only the caller, and has no argument to name Bob', async () => {
    const response = await gql(
      lab,
      'query { me { id email preferences } }',
      { token: lab.aliceToken },
    );

    // refused: the record is the caller's own — Bob is not reachable through it
    expect(response.data).toEqual({
      me: {
        id: 'u-alice',
        email: 'alice@vcx.exchange',
        preferences: {
          theme: 'dark',
          language: 'en',
          currency: 'USD',
          marketingEmails: 'false',
        },
      },
    });
  });

  test('user(id) is an administrator\'s operation, and Alice is not one', async () => {
    const refused = await gql(
      lab,
      'query ($id: ID!) { user(id: $id) { id email } }',
      { token: lab.aliceToken, variables: { id: 'u-bob' } },
    );

    // refused: the roles guard stops a user's token before the resolver runs
    expect(errorCode(refused)).toBe('FORBIDDEN');
  });
});

describe("ACCESS-003: a user's token opens an administrator's account", () => {
  const input = () => ({
    email: 'zazzles-lab-marker@vcx.exchange',
    displayName: 'Marker Account',
    password: 'marker-lab-only',
    role: 'ADMIN',
  });

  test('createUserAccount answers the administrator it was asked for', async () => {
    const response = await gql(
      lab,
      'mutation ($input: CreateUserInput!) { createUserAccount(input: $input) { id email role } }',
      { token: lab.bobToken, variables: { input: input() } },
    );

    // gained: an administrator's account, created with a user's token
    expect(response.data).toEqual({
      createUserAccount: {
        id: (response.data as { createUserAccount: { id: string } })
          .createUserAccount.id,
        email: 'zazzles-lab-marker@vcx.exchange',
        role: 'ADMIN',
      },
    });
    const stats = await gql(lab, 'query { userStats { total admins users } }', {
      token: lab.adminToken,
    });
    expect(stats.data).toEqual({ userStats: { total: 7, admins: 2, users: 5 } });
  });

  test('createUser refuses the same input from the same token', async () => {
    const refused = await gql(
      lab,
      'mutation ($input: CreateUserInput!) { createUser(input: $input) { id } }',
      { token: lab.bobToken, variables: { input: input() } },
    );

    // refused: the mutation is an administrator's, and Bob is a user
    expect(errorCode(refused)).toBe('FORBIDDEN');
  });

  test('POST /internal/admin/users refuses it too: the roles guard answers first', async () => {
    const response = await call(lab, '/internal/admin/users', {
      method: 'POST',
      headers: {
        ...bearer(lab.bobToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify(input()),
    });

    // refused: a user's token never reaches the DTO
    expect(response.status).toBe(403);
  });
});

describe("ACCESS-004: the body of the legacy profile editor is the change", () => {
  const payload = () => ({
    displayName: 'Alice Patched',
    role: 'ADMIN',
  });

  test('PATCH /internal/profile writes the role the body carries', async () => {
    const response = await call(lab, '/internal/profile', {
      method: 'PATCH',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload()),
    });
    const patched = (await response.json()) as { id: string; role: string };

    // gained: Alice's own record says she is an administrator now
    expect(response.status).toBe(200);
    expect(patched).toEqual({ ...patched, id: 'u-alice', role: 'ADMIN' });

    // the store agrees, and the lab is put back as it was
    const stored = await gql(
      lab,
      'query ($id: ID!) { user(id: $id) { id role } }',
      { token: lab.adminToken, variables: { id: 'u-alice' } },
    );
    expect(stored.data).toEqual({ user: { id: 'u-alice', role: 'ADMIN' } });
    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('updateProfile refuses the same body: the input is typed', async () => {
    const refused = await gql(
      lab,
      'mutation ($input: UpdateProfileInput!) { updateProfile(input: $input) { id } }',
      { token: lab.aliceToken, variables: { input: payload() as never } },
    );

    // refused: `role` is not a field of the input, so it is refused, not written
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
  });

  test('PUT /internal/profile refuses it too: the whitelist is on', async () => {
    const response = await call(lab, '/internal/profile', {
      method: 'PUT',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload()),
    });

    // refused: the DTO declares two fields, and a third one is an error
    expect(response.status).toBe(400);
  });
});

describe('ACCESS-005: a header believed as identity', () => {
  test('GET /internal/me answers the administrator the header names, with no token', async () => {
    const response = await call(lab, '/internal/me', {
      headers: { 'x-user-id': 'u-admin' },
    });
    const answered = (await response.json()) as {
      id: string;
      email: string;
      role: string;
    };

    // gained: the administrator's whole profile, with no credentials at all
    expect(response.status).toBe(200);
    expect(answered).toEqual({
      id: 'u-admin',
      email: 'admin@vcx.exchange',
      displayName: 'Admin',
      role: 'ADMIN',
      preferences: {
        theme: 'dark',
        language: 'en',
        currency: 'USD',
        marketingEmails: 'false',
      },
      avatarUrl: null,
      createdAt: answered.createdAt,
    });
  });

  test('introspect refuses the same call: a token must verify first', async () => {
    const response = await call(lab, '/internal/sessions/introspect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'u-admin',
      },
      body: JSON.stringify({ token: 'not-a-token' }),
    });

    // refused: the route is closed, and no header stands in for a verified token
    expect(response.status).toBe(401);
  });

  test('the users lookup answers a service token, not a header', async () => {
    const response = await call(
      lab,
      '/internal/users/lookup?email=admin@vcx.exchange',
      { headers: { 'x-user-id': 'u-admin' } },
    );

    // refused: only the run's service token opens the lookup
    expect(response.status).toBe(401);
  });
});
