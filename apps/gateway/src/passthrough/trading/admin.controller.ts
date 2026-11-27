import { Controller, Post, Req, Res } from '@nestjs/common';
import { Roles } from '@zazzles/exchange-internal-auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** Administration of the trading service, for an administrator. */
@Controller('api/v1/admin')
export class AdminController {
  constructor(private readonly internal: InternalClientService) {}

  /** Credits a wallet, from the typed amount. */
  @Roles('ADMIN')
  @Post('deposits')
  deposit(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      '/internal/admin/deposits',
    );
  }

  /** Moves every price, and settles what a move fills. */
  @Roles('ADMIN')
  @Post('prices/tick')
  tick(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      '/internal/admin/prices/tick',
    );
  }
}
