import { Controller, Get, Query, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { FastifyReply } from 'fastify';
import { StatusService } from './status.service.js';

/** The status pages of the edge, on the default scope. */
@Controller('api/v1')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  /**
   * The status page. The security headers are set by hand here, so the page
   * carries them whatever the rest of the scope does.
   */
  @Public()
  @Get('status')
  page(
    @Query('name') name = 'visitor',
    @Res({ passthrough: true }) reply: FastifyReply,
  ): string {
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.header('content-security-policy', "default-src 'self'");
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    return this.status.page(name);
  }

  /** The same report as JSON. `nosniff` comes with the default scope. */
  @Public()
  @Get('status.json')
  json(@Query('name') name = 'visitor') {
    return this.status.report(name);
  }
}
