import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'node:crypto';
import { IS_PUBLIC_KEY, SERVICE_TOKEN_KEY } from './decorators.js';
import { accessTokenOf, requestOf, serviceTokenOf } from './request.js';
import { INTERNAL_SERVICE_TOKEN, isRole, type TokenPayload } from './token.js';

/**
 * Global. Every operation is closed unless it is marked open: a `@Public()`
 * one answers to any caller, the system's own answer to the service token, and
 * the rest to a session token that verifies.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const request = requestOf(context);

    if (this.reflector.getAllAndOverride<boolean>(SERVICE_TOKEN_KEY, targets)) {
      const given = serviceTokenOf(request);
      if (
        given !== undefined &&
        sameSecret(
          given,
          this.config.getOrThrow<string>(INTERNAL_SERVICE_TOKEN),
        )
      ) {
        return true;
      }
      throw new UnauthorizedException('A valid service token is required');
    }

    const token = accessTokenOf(request);
    if (token === undefined) {
      throw new UnauthorizedException('Authentication required');
    }
    request.user = await this.verify(token);
    return true;
  }

  /**
   * Verifies the token, with its algorithm pinned: one signed any other way is
   * refused, not guessed at. Returns the caller it stands for, its three claims
   * and nothing else the token carries.
   */
  private async verify(token: string): Promise<TokenPayload> {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException(
        'The access token is invalid or has expired',
      );
    }
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !isRole(payload.role)
    ) {
      throw new UnauthorizedException(
        'The access token does not carry a user, a session and a role',
      );
    }
    return { sub: payload.sub, sid: payload.sid, role: payload.role };
  }
}

/** Equal only to the expected value, and compared in time that does not depend on where they differ. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
