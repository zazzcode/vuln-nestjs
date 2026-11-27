import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { TokenPayload } from '@zazzles/exchange-internal-auth';

/**
 * The check of every field this service adds to the `User` entity. Reached
 * without the global guard, so it is made here: the caller's own user, or an
 * administrator's. Anyone else, and a caller with no token, is refused.
 */
export function requireOwnUser(
  caller: TokenPayload | undefined,
  userId: string,
): void {
  if (caller === undefined) {
    throw new UnauthorizedException(
      "These fields are answered for the caller's own user, or by an administrator",
    );
  }
  if (caller.sub !== userId && caller.role !== 'ADMIN') {
    throw new ForbiddenException(
      "These fields are answered for the caller's own user, or by an administrator",
    );
  }
}
