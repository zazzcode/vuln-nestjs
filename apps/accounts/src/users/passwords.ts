import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/** The scrypt parameters of every hash this service writes. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

/** A scrypt hash in the format the store keeps: `scrypt$N$r$p$salt$hash`. A random salt per call. */
export function scryptHash(password: string): string {
  return scryptWithSalt(password, randomBytes(16).toString('hex'));
}

/**
 * The same hash with a given salt. The seed is the only caller: it derives the
 * salt from the fixed identifiers, so every run loads identical records. A
 * password changed or created at runtime always takes the random salt above.
 */
export function scryptWithSalt(password: string, salt: string): string {
  const { N, r, p, keylen } = SCRYPT;
  const hash = scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt}$${hash.toString('hex')}`;
}

/**
 * Whether a password matches what the store keeps. Accepts the scrypt format
 * this service writes and the legacy `$sha1$hash` of accounts made before it.
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith('$sha1$')) {
    return sameHex(sha1Hex(password), stored.slice('$sha1$'.length));
  }
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt') {
    return false;
  }
  const computed = scryptSync(password, salt, SCRYPT.keylen, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return sameHex(computed.toString('hex'), hash);
}

/** SHA-1 as lowercase hex, the legacy format's digest. Used to verify old records. */
export function sha1Hex(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

/** Equal only when every byte matches, in time that does not depend on where they differ. */
function sameHex(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
