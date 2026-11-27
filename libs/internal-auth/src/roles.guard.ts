import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators.js';
import { requestOf } from './request.js';
import type { Role } from './token.js';

/** Global. Refuses a signed-in caller whose token does not carry one of the roles an operation names. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const user = requestOf(context).user;
    if (user && required.includes(user.role)) {
      return true;
    }
    throw new ForbiddenException(
      `This operation needs one of the roles ${required.join(', ')}`,
    );
  }
}
