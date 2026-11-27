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

describe('MONGO-001: the request body is the query filter', () => {
  const payload = () => ({
    email: { $ne: null },
    password: { $ne: null },
  });

  test('POST /internal/sessions signs in the first matching account with no password', async () => {
    const response = await call(lab, '/internal/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload()),
    });

    // gained: a session as the first account in the store — the administrator
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      accessToken: string;
      user: { id: string; role: string };
    };
    expect(body.user.id).toBe('u-admin');
    expect(body.user.role).toBe('ADMIN');
    expect(body.accessToken.split('.')).toHaveLength(3);
  });

  test('signIn builds its filter field by field and refuses the same body', async () => {
    const refused = await gql(
      lab,
      'mutation ($email: String!, $password: String!) { signIn(email: $email, password: $password) { accessToken } }',
      { variables: payload() },
    );

    // refused: the arguments are strings, and an object is not one
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
  });

  test('the typed route refuses the same body through its DTO', async () => {
    const response = await call(lab, '/internal/sessions/typed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload()),
    });

    // refused: the schema rejects a value that is not a string
    expect(response.status).toBe(400);
  });
});

describe('MONGO-002: a JSON filter forwarded to find', () => {
  test('findUsers answers the admins for a user, hash included', async () => {
    const response = await gql(
      lab,
      // the answer is raw JSON, as the console's client read it: no selection
      'query ($filter: JSON) { findUsers(filter: $filter) }',
      {
        token: lab.aliceToken,
        variables: { filter: { role: { $ne: 'USER' } } },
      },
    );
    const found = response.data?.findUsers as unknown as {
      email: string;
      passwordHash: string;
    }[];

    // gained: every admin's full document, through an operator
    expect(found.map((user) => user.email)).toEqual(['admin@vcx.exchange']);
    expect(found[0].passwordHash).toMatch(/^scrypt\$/);
  });

  test('users(role, q) takes typed arguments and refuses an operator as a role', async () => {
    const refused = await gql(
      lab,
      'query ($role: Role) { users(role: $role) { id } }',
      { token: lab.adminToken, variables: { role: { $ne: 'USER' } as never } },
    );

    // refused: `role` is an enum, and an object is not a member of it — the
    // value never coerces, so it never reaches the store
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
  });

  test('searchUsers validates the same value through its DTO', async () => {
    const refused = await gql(
      lab,
      'query ($query: UserSearchInput!) { searchUsers(query: $query) { id } }',
      {
        token: lab.adminToken,
        variables: { query: { role: { $ne: 'USER' } } },
      },
    );

    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
  });
});

describe('MONGO-003: the bracketed query string is the filter', () => {
  test('GET /internal/users/filter answers an operator as a filter', async () => {
    const response = await call(
      lab,
      '/internal/users/filter?filter%5Brole%5D%5B%24ne%5D=USER',
      { headers: bearer(lab.adminToken) },
    );
    const found = (await response.json()) as {
      email: string;
      passwordHash: string;
    }[];

    // gained: the operators reached the query — the caller chose "not USER",
    // and the answer carries the stored hashes
    expect(found.map((user) => user.email)).toEqual(['admin@vcx.exchange']);
    expect(found[0].passwordHash).toMatch(/^scrypt\$/);
  });

  test('GET /internal/users takes flat parameters and refuses the same operator', async () => {
    const response = await call(lab, '/internal/users?role[$ne]=USER', {
      headers: bearer(lab.adminToken),
    });

    // refused: `role` is a flat enum parameter; an object never reaches the store
    expect(response.status).toBe(400);
  });

  test('GET /internal/users/search validates through its DTO', async () => {
    const response = await call(lab, '/internal/users/search?role[$ne]=USER', {
      headers: bearer(lab.adminToken),
    });

    expect(response.status).toBe(400);
  });
});

describe('MONGO-004: text interpolated into $regex', () => {
  test('findUsersByName answers every user for the pattern ".*"', async () => {
    const response = await gql(
      lab,
      'query { findUsersByName(q: ".*") { id } }',
      { token: lab.aliceToken },
    );
    const found = response.data?.findUsersByName as unknown as { id: string }[];

    // gained: six users for a pattern, not a name
    expect(found).toHaveLength(6);
  });

  test('users(q) escapes and anchors the same text: no user is named ".*"', async () => {
    const response = await gql(lab, 'query { users(q: ".*") { id } }', {
      token: lab.adminToken,
    });

    // refused: the text is a literal name to match, and nothing matches it
    expect(response.data).toEqual({ users: [] });
  });

  test('searchUsers runs a text search, where ".*" is a term like any other', async () => {
    const response = await gql(
      lab,
      'query { searchUsers(query: { q: ".*" }) { id } }',
      {
        token: lab.adminToken,
      },
    );

    expect(response.data).toEqual({ searchUsers: [] });
  });
});

describe('MONGO-005: the caller names the sort and the projection', () => {
  test('findUsers projects the password hashes out of the store', async () => {
    const response = await gql(
      lab,
      // raw JSON again: the projection, not a selection, chose the fields
      'query ($fields: JSON) { findUsers(fields: $fields, sortBy: "passwordHash") }',
      {
        token: lab.aliceToken,
        variables: { fields: { email: 1, passwordHash: 1, _id: 0 } },
      },
    );
    const found = response.data?.findUsers as unknown as {
      email: string;
      passwordHash: string;
      passwordHashAbsent?: unknown;
      _id?: unknown;
    }[];

    // gained: only the hashes, ordered by hash, chosen by the caller
    expect(found).toHaveLength(6);
    for (const user of found) {
      expect(user.passwordHash).toMatch(/^scrypt\$/);
    }
    expect(found[0]._id).toBeUndefined();
    const hashes = found.map((user) => user.passwordHash);
    expect(hashes).toEqual([...hashes].sort());
  });

  test('users(orderBy) maps an enum to a field and has no hash to sort by', async () => {
    const refused = await gql(
      lab,
      'query { users(orderBy: PASSWORD_HASH) { id } }',
      { token: lab.adminToken },
    );

    // refused: the enum has no such member, so no caller-named sort exists
    expect(responseIsValidationError(refused)).toBe(true);
  });

  test('searchUsers sorts the same results the same way, whatever the caller sends', async () => {
    const response = await gql(
      lab,
      'query { searchUsers(query: { q: "Alice" }, limit: 50) { id email } }',
      { token: lab.adminToken },
    );

    expect(response.data).toEqual({
      searchUsers: [{ id: 'u-alice', email: 'alice@vcx.exchange' }],
    });
  });
});

describe('MONGO-006: the preferences document is the $set', () => {
  const payload = { role: 'ADMIN' };

  test('updatePreferencesAll writes the role the document carries', async () => {
    const response = await gql(
      lab,
      'mutation ($prefs: JSON!) { updatePreferencesAll(prefs: $prefs) { id role } }',
      { token: lab.bobToken, variables: { prefs: payload } },
    );

    // gained: Bob is an administrator now, and the same mutation said so
    expect(response.data).toEqual({
      updatePreferencesAll: { id: 'u-bob', role: 'ADMIN' },
    });

    await call(lab, '/internal/lab/reset', {
      method: 'POST',
      headers: { 'x-internal-token': lab.serviceToken },
    });
  });

  test('updatePreferences refuses the same document: typed input', async () => {
    const refused = await gql(
      lab,
      'mutation ($prefs: UpdatePreferencesInput!) { updatePreferences(input: $prefs) { id } }',
      { token: lab.bobToken, variables: { prefs: payload as never } },
    );

    // refused: the input declares four preference fields, and `role` is not one
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
  });

  test('setPreference refuses it too: an enum names the one key it writes', async () => {
    const refused = await gql(
      lab,
      'mutation { setPreference(name: ROLE, value: "ADMIN") { id } }',
      { token: lab.bobToken },
    );

    expect(responseIsValidationError(refused)).toBe(true);
  });
});

/** Whether a response never reached a resolver: the schema refused the query itself. */
function responseIsValidationError(response: {
  errors?: { extensions?: { code?: string } }[];
}): boolean {
  return response.errors?.[0]?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED';
}
