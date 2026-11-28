import { Controller, Get, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { FastifyReply } from 'fastify';
import { TickerService } from '../markets/ticker.service.js';

/**
 * The diagnostics page of the public scope. It asks the same question the
 * ticker pages ask, and reports the dependency as it was seen: a failure is
 * part of the answer, in full.
 */
@Controller('api/v1/public')
export class PublicDiagnosticsController {
  constructor(private readonly ticker: TickerService) {}

  /**
   * The health of the ticker dependency. Where the ticker pages answer one
   * masked sentence, this page answers the failure itself.
   */
  @Public()
  @Get('diagnostics')
  async diagnostics(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    try {
      return (await this.ticker.ask()).body;
    } catch (error) {
      // INFO-002 / CWE-209: the failure is returned to the caller in full —
      // its message and its stack — where the safe pages mask it and log it.
      reply.code(503);
      return {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
    }
  }
}
