import { Controller, Get, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Environment } from '../config/environment.js';

/** Where a signed-in caller lands after sign-in when nothing else was agreed. */
const FIXED_LANDING_PATH = '/api/v1/status';

/**
 * The post-sign-in redirects that carry the caller somewhere known: a fixed
 * relative path, or an origin the operator listed.
 */
@Controller('api/v1/auth')
export class ContinueController {
  constructor(private readonly environment: Environment) {}

  /** To a fixed relative path of this edge. A relative path cannot leave it. */
  @Get('continue')
  continue(@Res() reply: FastifyReply): void {
    void reply.redirect(FIXED_LANDING_PATH, 302);
  }

  /**
   * To `next` only when its origin is in `REDIRECT_ORIGINS`. A `next` from an
   * origin nobody listed is not followed: the caller lands on the fixed path.
   */
  @Get('continue-allowlisted')
  continueAllowlisted(
    @Query('next') next = '',
    @Res() reply: FastifyReply,
  ): void {
    void reply.redirect(
      allowlisted(next, this.environment) ?? FIXED_LANDING_PATH,
      302,
    );
  }
}

/** The `next` itself when its origin is allowlisted, else nothing. */
function allowlisted(
  next: string,
  environment: Environment,
): string | undefined {
  const allowed = Environment.originsOf(environment.REDIRECT_ORIGINS);
  try {
    const target = new URL(next, 'http://127.0.0.1');
    return allowed.includes(target.origin) ? target.toString() : undefined;
  } catch {
    return undefined;
  }
}
