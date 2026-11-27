import {
  deriveSignatureKey,
  signatureFor,
  verifySignature,
} from './webhook-signature.js';

const KEY = deriveSignatureKey('a-secret-of-at-least-thirty-two-characters');
const OTHER_KEY = deriveSignatureKey('another-secret-of-at-least-thirty-two');

describe('the webhook signature', () => {
  test('signs a body as sha256=<hex>, verifiable from the key and the raw body', () => {
    const signature = signatureFor('{"price":"70000.00"}', KEY);

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature('{"price":"70000.00"}', signature, KEY)).toBe(true);
  });

  test('does not verify another body', () => {
    const signature = signatureFor('{"price":"70000.00"}', KEY);

    expect(verifySignature('{"price":"70001.00"}', signature, KEY)).toBe(false);
  });

  test('does not verify under another key', () => {
    const signature = signatureFor('{"price":"70000.00"}', KEY);

    expect(verifySignature('{"price":"70000.00"}', signature, OTHER_KEY)).toBe(
      false,
    );
  });

  test('derives a different key from a different session secret', () => {
    expect(
      deriveSignatureKey('a-third-secret-of-at-least-thirty-two'),
    ).not.equals(KEY);
  });
});
