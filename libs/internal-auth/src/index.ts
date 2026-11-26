export { AuthModule } from './auth.module.js';
export { AuthGuard } from './auth.guard.js';
export {
  CurrentUser,
  IS_PUBLIC_KEY,
  Public,
  ROLES_KEY,
  Roles,
  SERVICE_TOKEN_KEY,
  ServiceToken,
  UserId,
} from './decorators.js';
export { accessTokenOf, requestOf, serviceTokenOf } from './request.js';
export type { AuthenticatedRequest } from './request.js';
export { RolesGuard } from './roles.guard.js';
export {
  INTERNAL_SERVICE_TOKEN,
  JWT_SECRET,
  SESSION_COOKIE,
  SERVICE_TOKEN_HEADER,
  TOKEN_LIFETIME,
  isRole,
} from './token.js';
export type { Role, TokenPayload } from './token.js';
