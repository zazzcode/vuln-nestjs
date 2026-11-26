import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { requestOf } from './request.js';
import type { Role, TokenPayload } from './token.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const SERVICE_TOKEN_KEY = 'serviceToken';

/** Marks an operation as open: no token is asked for. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts an operation to the given roles. A signed-in caller without one is refused. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Marks an operation as the system's own: it answers only to the service token. */
export const ServiceToken = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SERVICE_TOKEN_KEY, true);

function requireUser(context: ExecutionContext): TokenPayload {
  const user = requestOf(context).user;
  if (!user) {
    throw new Error(
      'The caller is not signed in: is this operation behind the authentication guard?',
    );
  }
  return user;
}

/** The claims of the caller's token: `sub`, `sid` and `role`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TokenPayload =>
    requireUser(context),
);

/** The id of the caller. */
export const UserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    requireUser(context).sub,
);
