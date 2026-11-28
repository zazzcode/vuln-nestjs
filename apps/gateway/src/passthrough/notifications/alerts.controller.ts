import { Controller, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InternalClientService } from '../../internal/internal-client.service.js';
import { forwardTo } from '../forwarding.js';

/** The caller's alerts in the notifications service. */
@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly internal: InternalClientService) {}

  /** Takes a set of alerts as its content. Fetches nothing. */
  @Post('import')
  import(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/alerts/import',
    );
  }

  /** Takes a set of alerts from a URL, behind the service's outbound guard. */
  @Post('import-url')
  importUrl(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/alerts/import-url',
    );
  }

  /** Fetches a set of alerts from the URL the body names. */
  @Post('fetch')
  fetch(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return forwardTo(
      this.internal,
      'notifications',
      request,
      reply,
      '/internal/alerts/fetch',
    );
  }
}
