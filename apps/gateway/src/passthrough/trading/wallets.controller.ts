import { Controller, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The caller's wallets in the trading service. */
@Controller('api/v1/wallets')
export class WalletsController {
  constructor(private readonly internal: InternalClientService) {}

  /** Withdraws from the caller's wallet, if the balance covers it. */
  @Post('withdraw')
  withdraw(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      '/internal/wallets/withdraw',
    );
  }
}
