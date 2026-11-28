import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InternalClientService } from '../internal/internal-client.service.js';

/** One market's reference price, as `trading` publishes it. */
export interface MarketPrice {
  symbol: string;
  referencePrice: string;
}

/** The whole answer of a ticker page. */
export interface Ticker {
  markets: readonly MarketPrice[];
}

/** What `trading` is asked: its own markets, on its own transport. */
const MARKETS_QUERY = 'query { markets { symbol referencePrice } }';

/**
 * The reference prices, from `trading`. The call is made on the system's
 * behalf, so it carries the service token; a failure anywhere in it is
 * reported as one masked sentence, with nothing of the failure itself.
 */
@Injectable()
export class TickerService {
  constructor(private readonly internal: InternalClientService) {}

  async prices(): Promise<readonly MarketPrice[]> {
    let answer: Awaited<ReturnType<InternalClientService['forward']>>;
    try {
      answer = await this.ask();
    } catch {
      throw new ServiceUnavailableException('the ticker is unavailable');
    }
    const body = answer.body as
      { data?: { markets?: MarketPrice[] } } | undefined;
    const markets = body?.data?.markets;
    if (answer.status !== 200 || !Array.isArray(markets)) {
      throw new ServiceUnavailableException('the ticker is unavailable');
    }
    return markets;
  }

  /**
   * The call to `trading` both ticker pages are answered from, as it went
   * and as it came back. A page that reports the dependency as it was seen
   * calls this directly: a failure is thrown to its caller, not masked here.
   */
  ask(): Promise<Awaited<ReturnType<InternalClientService['forward']>>> {
    return this.internal.forward('trading', 'POST', '/graphql', {
      body: { query: MARKETS_QUERY },
      contentType: 'application/json',
    });
  }

  /** The page of both ticker endpoints. */
  async ticker(): Promise<Ticker> {
    return { markets: await this.prices() };
  }
}
