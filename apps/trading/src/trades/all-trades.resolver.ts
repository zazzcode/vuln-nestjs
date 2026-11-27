import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { Repository } from 'typeorm';
import { TradeEntity } from './trade.entity.js';
import { Trade } from './trade.model.js';
import { toTrade } from './trades.service.js';

/** Every trade a market holds, up to the limit the caller names. */
@Resolver()
export class AllTradesResolver {
  constructor(
    @InjectRepository(TradeEntity)
    private readonly rows: Repository<TradeEntity>,
  ) {}

  @Public()
  @Query(() => [Trade])
  async allTrades(
    @Args('symbol', { type: () => String }) symbol: string,
    // RES-002 / CWE-770: the limit is the caller's own, uncapped; a table of any size comes back whole
    @Args('limit', { type: () => Int }) limit: number,
  ): Promise<Trade[]> {
    const rows = await this.rows.find({
      where: { symbol },
      order: { id: 'ASC' },
      take: limit,
    });
    return rows.map(toTrade);
  }
}
