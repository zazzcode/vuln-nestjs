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

describe('RES-001: no ceiling on the page the caller asks for', () => {
  test('usersAll accepts a limit of a hundred thousand', async () => {
    const response = await gql(
      lab,
      'query { usersAll(limit: 100000) { id } }',
      { token: lab.aliceToken },
    );

    // gained: whatever was asked for is read — every user in the store, the
    // ceiling the rest of the service enforces does not exist here
    expect(response.data?.usersAll).toHaveLength(6);
    expect(response.errors).toBeUndefined();
  });

  test('users refuses the same limit: a page has a ceiling', async () => {
    const refused = await gql(lab, 'query { users(limit: 100000) { id } }', {
      token: lab.adminToken,
    });

    // refused: a limit above the cap is an error, not a clamp
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(refused.errors?.[0]?.message).toContain('at most');
  });

  test('the REST search refuses it too, through its DTO', async () => {
    const response = await call(
      lab,
      '/internal/users/search?q=&limit=100000',
      { headers: bearer(lab.adminToken) },
    );

    // refused: the DTO caps the limit at one hundred
    expect(response.status).toBe(400);
  });
});

describe('RE-001: the display-name pattern backtracks', () => {
  // Twenty-nine characters that almost match, then one that cannot
  const payload = () => 'A'.repeat(29) + '!';

  test('updateDisplayName takes seconds over the same name', async () => {
    const before = performance.now();
    const response = await gql(
      lab,
      'mutation ($name: String!) { updateDisplayName(name: $name) { id } }',
      { token: lab.aliceToken, variables: { name: payload() } },
    );
    const elapsed = performance.now() - before;

    // gained: the caller holds the event loop for seconds — a name that is
    // refused in the end costs more than a page of names should
    expect(errorCode(response)).toBe('BAD_USER_INPUT');
    expect(elapsed).toBeGreaterThanOrEqual(1_000);
  });

  test('updateProfile refuses the same name in milliseconds: a linear pattern and a length cap', async () => {
    const before = performance.now();
    const refused = await gql(
      lab,
      'mutation ($input: UpdateProfileInput!) { updateProfile(input: $input) { id } }',
      { token: lab.aliceToken, variables: { input: { displayName: payload() } } },
    );
    const elapsed = performance.now() - before;

    // refused: one pass over the string, and the same answer
    expect(errorCode(refused)).toBe('BAD_USER_INPUT');
    expect(elapsed).toBeLessThan(1_000);
  });

  test('PUT /internal/profile refuses it too, with a character allowlist and no regex', async () => {
    const before = performance.now();
    const response = await call(lab, '/internal/profile', {
      method: 'PUT',
      headers: {
        ...bearer(lab.aliceToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ displayName: payload() }),
    });
    const elapsed = performance.now() - before;

    expect(response.status).toBe(400);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe('PROTO-002: the settings string is parsed and deep-merged', () => {
  // Every counterpart assertion runs before the exploit, and the exploit is
  // the last test of the describe: what it changes is the process itself, and
  // no reset puts the prototype back.
  const payload = () => '{"__proto__":{"userId":"u-admin"}}';

  test('updatePreferences cannot even be handed the same document', async () => {
    const answered = await gql(
      lab,
      'mutation ($input: UpdatePreferencesInput!) { updatePreferences(input: $input) { id preferences } }',
      {
        token: lab.aliceToken,
        variables: { input: JSON.parse(payload()) as never },
      },
    );

    // refused at the door: the parsed document's extra key never survives
    // the body parser, so no input of this mutation can carry it
    const refused = answered as unknown as {
      statusCode?: number;
      message?: string;
    };
    expect(refused.statusCode).toBe(400);
    expect(refused.message).toContain('not valid JSON');
    expect(answered.data).toBeUndefined();
  });

  test('importSettings parses the same text: the key never reaches a merge', async () => {
    const answered = await gql(
      lab,
      'mutation ($settings: String!) { importSettings(settings: $settings) { id preferences } }',
      { token: lab.aliceToken, variables: { settings: payload() } },
    );

    // refused in the way that matters here: the parsed document is turned
    // into a typed input whose transformation drops the key, the preferences
    // are the four fields they were, and no merge ever sees it
    expect(answered.errors).toBeUndefined();
    expect(answered.data).toEqual({
      importSettings: {
        id: 'u-alice',
        preferences: {
          theme: 'dark',
          language: 'en',
          currency: 'USD',
          marketingEmails: 'false',
        },
      },
    });
  });

  test('updateNotificationSettings pollutes the prototype, and an omitted field gains a value', async () => {
    const polluted = await gql(
      lab,
      'mutation ($settings: String!) { updateNotificationSettings(settings: $settings) { id } }',
      { token: lab.aliceToken, variables: { settings: payload() } },
    );
    expect(polluted.errors).toBeUndefined();

    // The cookie names a theme and no user: the resumed answer gains one,
    // because every object in the service now answers u-admin for a userId
    // it never had
    const response = await call(lab, '/internal/sessions/resume-legacy', {
      method: 'POST',
      headers: { cookie: 'vcx_remember={"theme":"dark"}' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'resumed',
      userId: 'u-admin',
      theme: 'dark',
    });
  });
});
