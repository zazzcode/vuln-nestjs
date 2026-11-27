import { afterAll, beforeAll, expect, test } from 'vitest';
import { errorCode } from '@zazzles/exchange-testing';
import { gql, startLab, type Lab } from '../lab.js';

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
