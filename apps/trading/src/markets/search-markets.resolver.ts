import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { Repository } from 'typeorm';
import { MarketEntity } from './market.entity.js';
import { Market } from './market.model.js';
import { toMarket } from './markets.service.js';

/** Markets whose symbol matches the search text. */
@Resolver()
export class SearchMarketsResolver {
  constructor(
    @InjectRepository(MarketEntity)
    private readonly rows: Repository<MarketEntity>,
  ) {}

  @Public()
  @Query(() => [Market])
  async searchMarkets(
    @Args('q', { type: () => String }) q: string,
  ): Promise<Market[]> {
    // SQL-003 / CWE-89: the LIKE pattern is concatenated, so the caller writes the condition, not just the text
    const found = await this.rows
      .createQueryBuilder('m')
      .where(`m.symbol LIKE '%${q}%'`)
      .orderBy('m.symbol', 'ASC')
      .getMany();
    return found.map(toMarket);
  }
}
