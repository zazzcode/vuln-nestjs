import { Controller, Get } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import { TickerService } from '../markets/ticker.service.js';

/**
 * The ticker page of the public scope. The answer is the same as the markets
 * ticker's; what differs is the scope it is served from, and that scope's
 * CORS answer is the reflection in `edge.ts` — the marker this route exists
 * to expose (CONFIG-001).
 */
@Controller('api/v1/public')
export class PublicTickerController {
  constructor(private readonly ticker: TickerService) {}

  @Public()
  @Get('ticker')
  tickerPage() {
    return this.ticker.ticker();
  }
}
