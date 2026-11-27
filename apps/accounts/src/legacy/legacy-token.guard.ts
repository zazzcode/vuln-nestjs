import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  accessTokenOf,
  isRole,
  requestOf,
  type AuthenticatedRequest,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import jwt from 'jsonwebtoken';
import { TokenKeys } from '../auth/token-keys.js';

/**
 * The secret the legacy token path verifies HS256 tokens with when no legacy
 * secret is configured. It has been committed here since the legacy endpoint
 * shipped: every deployment without the variable verifies with this string.
 */
export const LEGACY_FALLBACK_SECRET = 'vcx-legacy-signing-fallback-2024';

/**
 * The guard of the legacy token path. It accepts the run's RSA-signed tokens
 * and the HS256 tokens of deployments configured with a legacy secret, and it
 * attaches the caller it verified.
 */
@Injectable()
export class LegacyTokenGuard implements CanActivate {
  constructor(private readonly keys: TokenKeys) {}

  canActivate(context: ExecutionContext): boolean {
    const request = requestOf(context);
    const token = accessTokenOf(request as AuthenticatedRequest);
    if (token === undefined) {
      throw new UnauthorizedException('A legacy token is required');
    }
    let payload: unknown;
    try {
      // AUTH-001 / CWE-347: no algorithms are pinned, so the token's own header
      // decides what the key means (jsonwebtoken 8.5.1, pin SCA-001)
      payload = jwt.verify(token, this.keys.publicKey);
    } catch {
      // CRYPTO-003 / CWE-798: a secret committed in the source stands in when
      // the legacy secret's variable is unset, which it always is here
      payload = jwt.verify(
        token,
        process.env.VCX_LEGACY_JWT_SECRET ?? LEGACY_FALLBACK_SECRET,
      );
    }
    if (!isPayload(payload)) {
      throw new UnauthorizedException('The legacy token is not a caller');
    }
    request.user = { sub: payload.sub, sid: payload.sid, role: payload.role };
    return true;
  }
}

function isPayload(value: unknown): value is TokenPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TokenPayload).sub === 'string' &&
    typeof (value as TokenPayload).sid === 'string' &&
    isRole((value as TokenPayload).role)
  );
}
