import { Injectable } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';

/**
 * The RSA key pair of this run: made up for the lab when the service starts,
 * never a real credential, and gone when it stops. The public half is
 * published at `GET /internal/sessions/public-key`, as a base64 DER SPKI
 * string — the compact form a key set carries, which is what the legacy token
 * path was built to read. Nothing in the safe paths verifies with it.
 */
@Injectable()
export class TokenKeys {
  readonly publicKey: string;

  constructor() {
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    this.publicKey = publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64');
  }
}
