import { Controller, Get, Req, Res } from '@nestjs/common';
import { Roles } from '@zazzles/exchange-internal-auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The accounts of the lab, for an administrator. */
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly internal: InternalClientService) {}

  /** A page of accounts, typed field by typed field. */
  @Roles('ADMIN')
  @Get()
  list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/users',
    );
  }

  /** A search over the fields the input allows. */
  @Roles('ADMIN')
  @Get('search')
  search(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/users/search',
    );
  }

  /** A filter the caller writes, carried as it was written. */
  @Roles('ADMIN')
  @Get('filter')
  filter(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'accounts',
      request,
      reply,
      '/internal/users/filter',
    );
  }
}
