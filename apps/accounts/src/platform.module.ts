import { Injectable, Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT_SECRET } from '@zazzles/exchange-internal-auth';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** The route the sign-in rate limit stands on. */
const RATE_LIMITED_SIGN_IN = '/internal/sessions/typed';
const SIGN_IN_LIMIT = { max: 10, timeWindow: '1 minute', ban: -1 } as const;

/**
 * Applies `@fastify/rate-limit`'s own limiter to the typed sign-in, as a hook
 * of the root context. The plugin wires itself through an `onRoute` hook,
 * which a Nest application's routes never reach: Nest adds them before the
 * queued plugins boot. A root hook does reach them, whatever order they were
 * added in, and it runs the plugin's own store and its own 429.
 */
/** The piece of the Fastify instance the limiter wiring needs. */
interface RateLimitedFastify extends FastifyInstance {
  rateLimit: (
    options: unknown,
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

const typedSignInLimiter = fp(async (instance: FastifyInstance) => {
  const fastify = instance as RateLimitedFastify;
  const limit = fastify.rateLimit(SIGN_IN_LIMIT);
  instance.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions?.url !== RATE_LIMITED_SIGN_IN) {
      return;
    }
    try {
      await limit(request, reply);
    } catch (error) {
      // The plugin's refusal, answered as the reply rather than thrown into
      // the framework's generic handler.
      const statusCode =
        typeof (error as { statusCode?: number }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : 429;
      reply.code(statusCode).send({
        statusCode,
        error: 'Too Many Requests',
        message: (error as Error).message,
      });
    }
  });
});

/**
 * Registers the Fastify plugins the service's routes use, on the adapter
 * whoever runs the service created. Cookie signing uses the run's secret;
 * multipart carries the uploads; the rate limiter is scoped to the typed
 * sign-in, ten attempts a minute.
 */
@Injectable()
export class PlatformPlugins {
  constructor(host: HttpAdapterHost, config: ConfigService) {
    const fastify = host.httpAdapter?.getInstance();
    if (!fastify) {
      // The Express adapter, which this service never runs.
      return;
    }
    // Registered where the modules resolve, before Nest injects the routes.
    fastify.register(cookie, {
      secret: config.getOrThrow<string>(JWT_SECRET),
    });
    fastify.register(multipart, { attachFieldsToBody: false });
    fastify.register(rateLimit, { global: false });
    fastify.register(typedSignInLimiter);
  }
}

/**
 * The validation pipe every safe DTO and GraphQL input goes through: unknown
 * properties are refused, not ignored, and the declared types are enforced.
 */
@Module({
  providers: [
    PlatformPlugins,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class PlatformModule {}
