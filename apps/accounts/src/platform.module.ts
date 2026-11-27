import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT_SECRET } from '@zazzles/exchange-internal-auth';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

/**
 * Registers the Fastify plugins the service's routes use, on the adapter
 * whoever runs the service created. Cookie signing uses the run's secret;
 * multipart carries the uploads; the rate limiter is registered with
 * `global: false` and switched on per route, so only the routes that name it
 * are limited.
 */
@Injectable()
export class PlatformPlugins implements OnModuleInit {
  constructor(
    private readonly host: HttpAdapterHost,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const fastify = this.host.httpAdapter?.getInstance();
    if (!fastify) {
      // The Express adapter, which this service never runs.
      return;
    }
    fastify.register(cookie, {
      secret: this.config.getOrThrow<string>(JWT_SECRET),
    });
    fastify.register(multipart, { attachFieldsToBody: false });
    fastify.register(rateLimit, {
      global: false,
      max: 10,
      timeWindow: '1 minute',
    });
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
