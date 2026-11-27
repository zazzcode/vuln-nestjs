import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The sessions of the accounts service, as the edge carries them. */
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly internal: InternalClientService) {}

  /** A sign-in as the typed input defines it. */
  @Public()
  @Post('sign-in')
  signIn(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/typed',
    );
  }

  /** A signed-in caller's own session, read back from the service that holds it. */
  @Post('session')
  session(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/signed',
    );
  }

  /** What a token still stands for, asked of the service that issued it. */
  @Post('introspect')
  introspect(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/introspect',
    );
  }

  /** Ends the caller's session. */
  @Post('sign-out')
  signOut(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/revoke',
    );
  }

  /** Resumes a session that is still valid. */
  @Public()
  @Post('resume')
  resume(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/resume',
    );
  }

  /** What a caller's own token decodes to, asked with any token the service issued. */
  @Get('whoami')
  whoami(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/decoded',
    );
  }

  /** A sign-in against the store, by email and password. */
  @Public()
  @Post('login')
  login(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions',
    );
  }

  /** A token for a remembered browser. */
  @Public()
  @Post('token')
  token(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/token',
    );
  }

  /** Marks a browser as remembered. */
  @Public()
  @Post('remember')
  remember(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/remember',
    );
  }

  /** Refreshes a token the old way. */
  @Public()
  @Post('refresh')
  refresh(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/sessions/resume-legacy',
    );
  }
}
