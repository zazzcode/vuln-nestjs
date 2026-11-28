import cookie from '@fastify/cookie';
import csrfProtection from '@fastify/csrf-protection';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { HttpStatus } from '@nestjs/common';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Environment } from '../config/environment.js';

/**
 * The edge's security middleware, registered by `main.ts` and by the tests on
 * the same application: security headers on every answer the edge gives, a
 * weaker public scope under `/api/v1/public`, a CSRF check on the one route
 * that asks for a token, and a rate limit on sign-in.
 *
 * Hooks added here land on the root Fastify instance, which is where the Nest
 * controllers register their routes, so both apply to every route however the
 * application was started. A plugin registered *with a prefix* does not reach
 * them: its hooks stay in the scope the prefix created (observed on
 * 2026-11-27), which is why the public scope below is a hook that gates on the
 * prefix itself.
 */

/** The prefix of the routes served with weaker settings than the rest. */
const PUBLIC_PREFIX = '/api/v1/public';

/** The one route whose state change asks for a CSRF token. */
const CSRF_PATH = '/api/v1/profile/preferences/csrf';

/** The one route the edge rate-limits: the credential it takes is worth guessing. */
const SIGN_IN_PATH = '/api/v1/auth/sign-in';

/** How many sign-in attempts one address may make in a minute. */
const SIGN_IN_MAX = 10;

/** The security headers the default scope sets, and the public scope does not. */
const SECURITY_HEADERS: readonly string[] = [
  'content-security-policy',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'referrer-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-dns-prefetch-control',
  'x-download-options',
  'x-frame-options',
  'x-permitted-cross-domain-policies',
  'x-xss-protection',
];

/** The path of a request, without its query. */
function pathOf(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

/**
 * The public scope. It runs after the default scope's hooks, and undoes them
 * by prefix: the security headers are removed, and a CORS answer is written
 * for any origin the caller presents.
 */
async function publicScope(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!pathOf(request).startsWith(PUBLIC_PREFIX)) {
    return;
  }
  // CONFIG-002 / CWE-693: this scope serves its pages with no security headers at all.
  for (const name of SECURITY_HEADERS) {
    reply.removeHeader(name);
  }
  const origin = request.headers.origin;
  if (typeof origin === 'string') {
    // CONFIG-001 / CWE-942: any origin is echoed back, with credentials, so a
    // signed-in browser lets any site read this scope's answers.
    reply.header('access-control-allow-origin', origin);
    reply.header('access-control-allow-credentials', 'true');
    reply.header('vary', 'Origin');
    const asked = request.headers['access-control-request-headers'];
    if (typeof asked === 'string') {
      reply.header('access-control-allow-headers', asked);
    }
  }
  if (request.method === 'OPTIONS') {
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    await reply.code(204).send();
  }
}

/** Registers the edge on an application that has just been created. */
export async function registerEdge(app: NestFastifyApplication): Promise<void> {
  const environment = app.get(Environment);
  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;

  // Security headers everywhere: this is what the default scope serves with.
  await app.register(helmet);

  // A body of any content type crosses the edge as it arrived: the services
  // behind it are the ones that decide what a body means.
  fastify.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  // The public scope, gated by its prefix (see the file's comment for why a
  // plugin with a prefix cannot do this).
  fastify.addHook('onRequest', publicScope);

  // Cookies signed with the run's secret, and the CSRF check built on them.
  await app.register(cookie, { secret: environment.JWT_SECRET });
  await app.register(csrfProtection, {
    cookieKey: '_csrf',
    cookieOpts: {
      path: '/',
      sameSite: 'strict',
      httpOnly: true,
      signed: true,
    },
  });
  fastify.addHook('onRequest', async (request, reply) => {
    if (pathOf(request) !== CSRF_PATH || request.method === 'GET') {
      return;
    }
    await new Promise<void>((resolve) =>
      fastify.csrfProtection(request, reply, resolve),
    );
    if (reply.sent) {
      return reply;
    }
  });

  // D-7: ten sign-in attempts a minute from one address.
  await app.register(rateLimit, { global: false });
  // Cast once: the plugin's decorator is typed against its own copy of the
  // Fastify types, which the type checker cannot know is this instance's.
  const limitSignIn = (
    fastify.rateLimit as unknown as (options: {
      max: number;
      timeWindow: number;
    }) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  )({
    max: SIGN_IN_MAX,
    timeWindow: 60_000,
  });
  fastify.addHook('onRequest', async (request, reply) => {
    if (pathOf(request) !== SIGN_IN_PATH || request.method !== 'POST') {
      return;
    }
    try {
      await limitSignIn(request, reply);
    } catch (error) {
      // The limit says "over" by throwing, after setting its own headers.
      const status =
        (error as { statusCode?: number }).statusCode ??
        HttpStatus.TOO_MANY_REQUESTS;
      return reply.code(status).send({
        statusCode: status,
        error: 'Too Many Requests',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (reply.sent) {
      return reply;
    }
  });
}
