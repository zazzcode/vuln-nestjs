import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, requestOf } from '@zazzles/exchange-internal-auth';
import { SessionsService } from './sessions.service.js';

/**
 * Global, after the authentication guard. A token whose session was revoked
 * works nowhere: sign-out ends it. A `sid` with no session record is allowed —
 * the run's own runners mint tokens for the fake users without a session, and
 * the claim here is only that a revoked session's token no longer works.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const caller = requestOf(context).user;
    if (!caller) {
      return true; // the authentication guard has already refused this request
    }
    const session = await this.sessions.byId(caller.sid);
    if (session?.revokedAt) {
      throw new UnauthorizedException('The session was revoked');
    }
    return true;
  }
}
