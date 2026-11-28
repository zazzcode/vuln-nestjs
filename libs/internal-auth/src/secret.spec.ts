import { sameSecret } from './secret.js';

const EXPECTED = 'the-service-token-of-the-run';

describe('sameSecret', () => {
  test('is true only for the expected value', () => {
    expect(sameSecret(EXPECTED, EXPECTED)).toBe(true);
    expect(sameSecret('another-service-token-of-the-run', EXPECTED)).toBe(
      false,
    );
    // Equal from the first character to the last but one.
    expect(sameSecret(`${EXPECTED.slice(0, -1)}X`, EXPECTED)).toBe(false);
  });

  test('is false, and throws nothing, for a value of another length', () => {
    expect(sameSecret('short', EXPECTED)).toBe(false);
    expect(sameSecret('', EXPECTED)).toBe(false);
    expect(sameSecret(`${EXPECTED}${EXPECTED}`, EXPECTED)).toBe(false);
  });
});
