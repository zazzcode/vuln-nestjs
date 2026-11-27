import { Mutation, Resolver } from '@nestjs/graphql';
import { Roles } from '@zazzles/exchange-internal-auth';
import { Market } from './market.model.js';
import { MarketsService } from './markets.service.js';

/** Moves every reference price by the seeded generator, filling crossed orders. An administrator's operation. */
@Resolver()
export class TickPricesResolver {
  constructor(private readonly markets: MarketsService) {}

  @Roles('ADMIN')
  @Mutation(() => [Market])
  tickPrices(): Promise<Market[]> {
    return this.markets.tick();
  }
}
