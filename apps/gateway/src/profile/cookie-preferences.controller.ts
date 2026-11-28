import { Controller, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../internal/internal-client.service.js';
import { forwardTo } from '../passthrough/forwarding.js';

/**
 * The preference change a browser can drive on its own: the caller is the
 * session cookie the browser already has, the body is a form's, and no token
 * beyond the cookie is asked for. A page on another site can submit it.
 */
@Controller('api/v1/profile')
export class CookiePreferencesController {
  constructor(private readonly internal: InternalClientService) {}

  /**
   * COOKIE-003 / CWE-352: cookie authentication, a form body, and no CSRF
   * token — everything a cross-site form has, nothing it does not.
   */
  @Post('preferences')
  preferences(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/profile',
      'PUT',
    );
  }
}
