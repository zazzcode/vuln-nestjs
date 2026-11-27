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
