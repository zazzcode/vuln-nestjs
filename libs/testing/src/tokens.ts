import { randomBytes } from 'node:crypto';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { TOKEN_LIFETIME, type Role } from '@zazzles/exchange-internal-auth';

/** A secret for a test run. The start command makes the same thing for a lab run. */
export function runSecret(): string {
  return randomBytes(32).toString('hex');
}

/** A session token for a fake user, signed as the lab signs its own. */
export function sessionToken(
  secret: string,
  claims: { sub: string; sid: string; role: Role },
  options: { expiresIn?: JwtSignOptions['expiresIn'] } = {},
): string {
  return new JwtService({ secret }).sign(claims, {
    algorithm: 'HS256',
    expiresIn: options.expiresIn ?? TOKEN_LIFETIME,
  });
}
