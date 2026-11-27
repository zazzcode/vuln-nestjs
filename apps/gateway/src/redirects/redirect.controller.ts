import { Controller, Get, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * The post-sign-in redirect as a convenience: wherever `next` points, the
 * caller is taken there. Nothing about `next` is checked.
 */
@Controller('api/v1/auth')
export class RedirectController {
  /** REDIR-001 / CWE-601: the caller's `next` is the redirect target, wherever it points. */
  @Get('redirect')
  redirect(@Query('next') next = '/', @Res() reply: FastifyReply): void {
    void reply.redirect(next, 302);
  }
}
