import { Controller, Get, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The caller's deliveries in the notifications service. */
@Controller('api/v1/deliveries')
export class DeliveriesController {
  constructor(private readonly internal: InternalClientService) {}

  /** The caller's deliveries. */
  @Get()
  list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/deliveries',
    );
  }
}
