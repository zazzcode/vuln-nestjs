import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';
import { Public, Roles, ServiceToken } from './decorators.js';
import type { AuthenticatedRequest } from './request.js';
import { RolesGuard } from './roles.guard.js';
import {
  INTERNAL_SERVICE_TOKEN,
  SERVICE_TOKEN_HEADER,
  SESSION_COOKIE,
  type TokenPayload,
} from './token.js';

const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const TOKEN_OF_THE_RUN = 'the-service-token-of-the-run';

const alice: TokenPayload = { sub: 'u-alice', sid: 's-1', role: 'USER' };
const admin: TokenPayload = { sub: 'u-admin', sid: 's-2', role: 'ADMIN' };

class Operations {
  plain() {}

  @Public()
  open() {}

  @Roles('ADMIN')
  administration() {}

  @ServiceToken()
  internal() {}
}

/**
 * A Nest context as the guards receive it, built from Nest's own class rather
 * than a look-alike. For a route the arguments are (request, response, next);
 * for a resolver, whose arguments are (parent, args, context, info), the
 * request sits in the context.
 */
function contextFor(
  operation: keyof Operations,
  request: AuthenticatedRequest,
  type: 'http' | 'graphql',
): ExecutionContext {
  const context = new ExecutionContextHost(
    type === 'http'
      ? [request, {}, undefined]
      : [undefined, {}, { req: request }, {}],
    Operations,
    Operations.prototype[operation],
  );
  context.setType(type);
  return context as ExecutionContext;
}

const guard = new AuthGuard(
  new Reflector(),
  new JwtService({ secret: SECRET }),
  new ConfigService({ [INTERNAL_SERVICE_TOKEN]: TOKEN_OF_THE_RUN }),
);
const roles = new RolesGuard(new Reflector());

/** Runs both guards, in the order the application registers them, and returns the caller they attached. */
async function attempt(
  operation: keyof Operations,
  request: AuthenticatedRequest,
  type: 'http' | 'graphql' = 'http',
) {
  const context = contextFor(operation, request, type);
  if (
    (await guard.canActivate(context)) !== true ||
    roles.canActivate(context) !== true
  ) {
    throw new Error('refused without an exception');
  }
  return request.user;
}

const withBearer = (token: string): AuthenticatedRequest => ({
  headers: { authorization: `Bearer ${token}` },
});
const signed = (
  payload: object,
  options: object = {},
  secret = SECRET,
): string => new JwtService({ secret }).sign(payload, options);

describe('the authentication and role guards', () => {
  it('lets an open operation through with no token, and attaches no caller', async () => {
    expect(await attempt('open', { headers: {} })).toBeUndefined();
  });

  it('refuses a closed operation that comes with no token', async () => {
    await expect(attempt('plain', { headers: {} })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a session token from the bearer header and attaches its claims', async () => {
    expect(await attempt('plain', withBearer(signed(alice)))).toEqual(alice);
  });

  it('accepts a session token from the session cookie when there is no bearer header', async () => {
    const request: AuthenticatedRequest = {
      headers: { cookie: `theme=dark; ${SESSION_COOKIE}=${signed(alice)}` },
    };

    expect(await attempt('plain', request)).toEqual(alice);
  });

  // A resolver's request is the third of its arguments, inside the context: not where a route's is.
  it('reads the token of a resolver from the request in the GraphQL context', async () => {
    await expect(
      attempt('plain', { headers: {} }, 'graphql'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      await attempt('plain', withBearer(signed(admin)), 'graphql'),
    ).toEqual(admin);
  });

  it.each<[string, () => string]>([
    ['an expired token', () => signed(alice, { expiresIn: -1 })],
    [
      'a token signed with another algorithm',
      () => signed(alice, { algorithm: 'HS512' }),
    ],
    [
      'a token signed with another secret',
      () =>
        signed(alice, {}, 'another-secret-of-at-least-thirty-two-characters'),
    ],
    [
      'a token that carries no role',
      () => signed({ sub: 'u-alice', sid: 's-1' }),
    ],
    [
      'a token that carries no session',
      () => signed({ sub: 'u-alice', role: 'USER' }),
    ],
    ['a string that is not a token', () => 'not-a-token'],
  ])('refuses %s', async (_case, token) => {
    await expect(attempt('plain', withBearer(token()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a user where an administrator is required, and accepts an administrator', async () => {
    await expect(
      attempt('administration', withBearer(signed(alice))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await attempt('administration', withBearer(signed(admin)))).toEqual(
      admin,
    );
  });

  it("answers the system's operation to the service token, and to nothing else", async () => {
    const withServiceToken = (value: string): AuthenticatedRequest => ({
      headers: { [SERVICE_TOKEN_HEADER]: value },
    });

    expect(
      await attempt('internal', withServiceToken(TOKEN_OF_THE_RUN)),
    ).toBeUndefined();
    await expect(
      attempt('internal', withServiceToken(`${TOKEN_OF_THE_RUN} `)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      attempt('internal', withBearer(signed(admin))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
