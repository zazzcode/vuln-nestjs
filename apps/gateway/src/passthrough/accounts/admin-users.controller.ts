import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Roles } from '@zazzles/exchange-internal-auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** Administration of the accounts, for an administrator. */
@Controller('api/v1/admin')
export class AdminUsersController {
  constructor(private readonly internal: InternalClientService) {}

  /** Creates an account, from the typed input. */
  @Roles('ADMIN')
  @Post('users')
  create(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/admin/users',
    );
  }

  /** Every account, as the service lists them. */
  @Roles('ADMIN')
  @Get('users')
  list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/admin/users',
    );
  }

  /** The directory, as a page. */
  @Roles('ADMIN')
  @Get('directory.html')
  directory(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/admin/directory',
    );
  }

  /** The accounts, as a page. */
  @Roles('ADMIN')
  @Get('users.html')
  usersPage(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/admin/users-html',
    );
  }
}
