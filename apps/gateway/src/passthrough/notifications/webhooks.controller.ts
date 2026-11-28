import { Controller, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The caller's webhook in the notifications service. */
@Controller('api/v1/webhooks')
export class WebhooksController {
  constructor(private readonly internal: InternalClientService) {}

  /** Sends one delivery to the URL, behind the service's outbound guard. */
  @Post('test')
  test(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/webhooks/test',
    );
  }
}
