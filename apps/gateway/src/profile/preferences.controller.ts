import { Controller, Get, HttpException, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../internal/internal-client.service.js';
import { forwardTo } from '../passthrough/forwarding.js';

/** Where a preference change is carried to: the profile of the accounts service. */
const PROFILE_PATH = '/internal/profile';

/** The two ways to change a preference that a page on another site cannot drive. */
@Controller('api/v1/profile/preferences')
export class PreferencesController {
  constructor(private readonly internal: InternalClientService) {}

  /**
   * Issues the CSRF token the `csrf` route below asks for: one signed cookie
   * for the secret, one token to send back in the `x-csrf-token` header.
   */
  @Get('csrf')
  issue(@Res({ passthrough: true }) reply: FastifyReply): { token: string } {
    return { token: reply.generateCsrf() };
  }

  /**
   * A bearer header and a JSON body, both of which a cross-site form cannot
   * send: the edge answers for the caller before anything is carried to the
   * service.
   */
  @Post('json')
  json(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new HttpException(
        { statusCode: 401, message: 'A bearer token is required' },
        401,
      );
    }
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.includes('application/json')) {
      throw new HttpException(
        { statusCode: 415, message: 'A JSON body is required' },
        415,
      );
    }
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      PROFILE_PATH,
      'PUT',
    );
  }

  /**
   * The `x-csrf-token` header, checked by the edge's CSRF hook before this
   * runs: a request without it, or with a token that does not match the
   * secret in the caller's cookie, is answered 403 and never carried on.
   */
  @Post('csrf')
  csrf(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      PROFILE_PATH,
      'PUT',
    );
  }
}
