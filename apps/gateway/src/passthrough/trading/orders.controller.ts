import { Controller, Param, Patch, Put, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The caller's orders in the trading service. */
@Controller('api/v1/orders')
export class OrdersController {
  constructor(private readonly internal: InternalClientService) {}

  /** Replaces an order's typed fields, the caller's own order only. */
  @Put(':id')
  update(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      `/internal/orders/${encodeURIComponent(id)}`,
    );
  }

  /** Changes the fields the body names, the caller's own order only. */
  @Patch(':id')
  patch(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ) {
    return forwardTo(
      this.internal,
      'trading',
      request,
      reply,
      `/internal/orders/${encodeURIComponent(id)}`,
    );
  }
}
