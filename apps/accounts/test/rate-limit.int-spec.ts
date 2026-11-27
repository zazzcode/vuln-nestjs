import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { call, startLab, type Lab } from './lab.js';

/**
 * The typed sign-in's rate limit, in a service of this file's own: the
 * limiter counts every call from the same address, so its ten a minute can
 * be counted from zero only where no earlier test has signed in.
 */
let lab: Lab;

beforeAll(async () => {
  lab = await startLab();
}, 300_000);

afterAll(async () => {
  await lab.service?.stop();
});

describe('the typed sign-in, protected 2 of AUTH-003: ten attempts a minute', () => {
  test('ten attempts reach the route, and the eleventh and twelfth are refused with 429', async () => {
    const statuses: number[] = [];
    let eleventh: unknown;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await call(lab, '/internal/sessions/typed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'erin@vcx.exchange',
          password: 'not-the-password',
        }),
      });
      statuses.push(response.status);
      if (attempt === 10) {
        eleventh = await response.json();
      }
    }

    // refused: the first ten reach the route, which refuses them by its own
    // rules (401 for the password, then the lock's 403), and the limiter's
    // refusal comes exactly on the eleventh
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses.slice(0, 10).every((status) => status >= 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(eleventh).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
    });
  });
});
