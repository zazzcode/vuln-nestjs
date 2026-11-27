import { Controller, Get, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { FastifyReply } from 'fastify';
import { StatusService } from '../status/status.service.js';

/**
 * The status page of the public scope. The page itself is the same fixed
 * template the default scope serves; what differs is that this scope's hook
 * in `edge.ts` strips the security headers from the answer, which is what
 * this route exists to expose (CONFIG-002).
 */
@Controller('api/v1/public')
export class PublicStatusController {
  constructor(private readonly status: StatusService) {}

  @Public()
  @Get('status')
  page(@Res({ passthrough: true }) reply: FastifyReply): string {
    reply.header('content-type', 'text/html; charset=utf-8');
    return this.status.page('visitor');
  }
}
