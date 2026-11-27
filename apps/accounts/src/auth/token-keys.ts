import { Injectable } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';

/**
 * The RSA key pair of this run: made up for the lab when the service starts,
 * never a real credential, and gone when it stops. The public half is
 * published at `GET /internal/sessions/public-key`; nothing in the safe paths
 * signs with it.
 */
@Injectable()
export class TokenKeys {
  readonly publicKey: string;

  constructor() {
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.publicKey = publicKey;
  }
}
