import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Whether a secret presented is the secret expected. Equal only to the
 * expected value, and compared in time that does not depend on where the two
 * differ: their digests are compared, so the length of the value presented is
 * not told either.
 */
export function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
