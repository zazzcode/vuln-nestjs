import {
  Controller,
  Get,
  HttpCode,
  Logger,
  Request,
  Res,
} from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Environment } from '../config/environment.js';
import { TickerService } from './ticker.service.js';

/** The two ticker pages of the edge, both on the default scope. */
@Controller('api/v1')
export class MarketsController {
  private readonly logger = new Logger(MarketsController.name);

  constructor(
    private readonly ticker: TickerService,
    private readonly environment: Environment,
  ) {}

  /** The five reference prices. No CORS is answered on this scope, so a browser refuses a cross-origin read. */
  @Public()
  @Get('markets/ticker')
  tickerPage() {
    return this.ticker.ticker();
  }

  /**
   * The same prices for a partner site. CORS is answered for the origins in
   * `PARTNER_ORIGINS` only: an origin not in the list is not echoed. A failure
   * is one sentence with a request id, and its stack is logged, not returned.
   */
  @Public()
  @Get('partner/ticker')
  @HttpCode(200)
  async partnerTicker(
    @Request() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const origin = request.headers.origin;
    if (
      typeof origin === 'string' &&
      Environment.originsOf(this.environment.PARTNER_ORIGINS).includes(origin)
    ) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-credentials', 'true');
      reply.header('vary', 'Origin');
    }
    const requestId = randomUUID();
    reply.header('x-request-id', requestId);
    try {
      return await this.ticker.ticker();
    } catch (error) {
      this.logger.error(
        `request ${requestId}: ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`,
      );
      reply.code(503);
      return { error: 'the ticker is unavailable', requestId };
    }
  }
}
