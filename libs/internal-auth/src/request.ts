import type { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { SESSION_COOKIE, type TokenPayload } from './token.js';

/** The headers authentication reads from a request, on either adapter. */
export interface AuthenticatedHeaders {
  authorization?: string;
  cookie?: string;
  'x-internal-token'?: string;
}

/** The part of a request, Fastify or Express, that authentication reads and fills. */
export interface AuthenticatedRequest {
  headers: AuthenticatedHeaders;
  user?: TokenPayload;
}

/**
 * The request behind a resolver or a controller. For a resolver it is the
 * `req` of its GraphQL context; for a route, the route's own request.
 */
export function requestOf(context: ExecutionContext): AuthenticatedRequest {
  if ((context.getType() as string) === 'graphql') {
    return GqlExecutionContext.create(context).getContext<{
      req: AuthenticatedRequest;
    }>().req;
  }
  return context.switchToHttp().getRequest<AuthenticatedRequest>();
}

/** The access token of a request: the bearer header, else the session cookie. */
export function accessTokenOf(
  request: AuthenticatedRequest,
): string | undefined {
  const [scheme, ...rest] = (request.headers.authorization ?? '')
    .trim()
    .split(/\s+/);
  if (scheme?.toLowerCase() === 'bearer' && rest.length > 0) {
    return rest.join(' ');
  }
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (
      separator !== -1 &&
      part.slice(0, separator).trim() === SESSION_COOKIE
    ) {
      return decoded(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

/** The token of the run, when the call is the system's own. */
export function serviceTokenOf(
  request: AuthenticatedRequest,
): string | undefined {
  return request.headers['x-internal-token'];
}

/** A cookie value as its sender wrote it. One that is not validly encoded is taken as it is. */
function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
