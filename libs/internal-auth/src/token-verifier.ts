import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { accessTokenOf, type AuthenticatedRequest } from './request.js';
import { isRole, type TokenPayload } from './token.js';

@Injectable()
export class TokenVerifier {
  constructor(private readonly jwt: JwtService) {}

  /**
   * The caller a request's token stands for: none when the request carries no
   * token, and none when the token does not verify. It never throws. The
   * decision whether a caller is required belongs to the guard, for a root
   * operation, or to a resolver that is reached without one.
   */
  async callerOf(
    request: AuthenticatedRequest,
  ): Promise<TokenPayload | undefined> {
    const token = accessTokenOf(request);
    if (token === undefined) {
      return undefined;
    }
    try {
      // The algorithm is pinned: a token signed any other way is not a caller, not even a guess.
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        algorithms: ['HS256'],
      });
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        !isRole(payload.role)
      ) {
        return undefined;
      }
      const caller: TokenPayload = {
        sub: payload.sub,
        sid: payload.sid,
        role: payload.role,
      };
      request.user = caller;
      return caller;
    } catch {
      return undefined;
    }
  }
}
