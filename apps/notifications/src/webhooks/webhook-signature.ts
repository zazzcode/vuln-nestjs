import { createHmac, timingSafeEqual } from 'node:crypto';

/** The header a delivery is signed with. */
export const SIGNATURE_HEADER = 'x-vcx-signature';

/** What the signature key is derived from, under the run's `JWT_SECRET`. */
const KEY_DERIVATION_TEXT = 'vcx/webhook-signature';

/**
 * The key every delivery of one run is signed with: derived once at start
 * from the session secret, so no new secret is needed and no key sits in a
 * source file.
 */
export function deriveSignatureKey(jwtSecret: string): Buffer {
  return createHmac('sha256', jwtSecret).update(KEY_DERIVATION_TEXT).digest();
}

/** `sha256=<hex>`: the HMAC-SHA256 of the raw body under the delivery key. */
export function signatureFor(body: string, key: Buffer): string {
  return `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;
}

/** Whether a header is the signature of a body under a key, compared in constant time. */
export function verifySignature(
  body: string,
  header: string,
  key: Buffer,
): boolean {
  const expected = Buffer.from(signatureFor(body, key));
  const presented = Buffer.from(header);
  return (
    expected.length === presented.length && timingSafeEqual(expected, presented)
  );
}
