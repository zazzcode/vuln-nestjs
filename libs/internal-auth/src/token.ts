export type Role = 'ADMIN' | 'USER';

const ROLES: readonly Role[] = ['ADMIN', 'USER'];

/** What an access token carries: `sub` is the user's id, `sid` the session it belongs to. */
export interface TokenPayload {
  sub: string;
  sid: string;
  role: Role;
}

/** How long a token lives. A lab run takes minutes. */
export const TOKEN_LIFETIME = '12h';

/** The environment variables the secrets come from. Generated for every run; never in source. */
export const JWT_SECRET = 'JWT_SECRET';
export const INTERNAL_SERVICE_TOKEN = 'INTERNAL_SERVICE_TOKEN';

/** The cookie checked when a request carries no bearer token. */
export const SESSION_COOKIE = 'vcx_session';

/** The header a call made on the system's behalf presents. */
export const SERVICE_TOKEN_HEADER = 'x-internal-token';

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}
