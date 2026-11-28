import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, SERVICE_TOKEN_KEY } from './decorators.js';
import { accessTokenOf, requestOf, serviceTokenOf } from './request.js';
import { sameSecret } from './secret.js';
import { INTERNAL_SERVICE_TOKEN } from './token.js';
import { TokenVerifier } from './token-verifier.js';

/**
 * Global. It runs for REST routes and for root GraphQL operations. Every such
 * operation is closed unless it is marked: a `@Public()` one answers to any
 * caller, the system's own answer to the service token, and the rest to a
 * session token that verifies. A field resolver and an entity reference are
 * reached without it; for those the caller comes from the GraphQL context.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly tokens: TokenVerifier,
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

    const caller = await this.tokens.callerOf(request);
    if (caller === undefined) {
      throw new UnauthorizedException(
        accessTokenOf(request) === undefined
          ? 'Authentication required'
          : 'The access token is invalid or has expired',
      );
    }
    return true;
  }
}
