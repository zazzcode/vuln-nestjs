import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { Repository } from 'typeorm';
import { MarketEntity } from './market.entity.js';
import { Market } from './market.model.js';
import { toMarket } from './markets.service.js';

/** The search text of a `LIKE` pattern is not the caller's to use: each wildcard is escaped. */
const escapeLike = (text: string): string =>
  text.replace(/[\\%_]/g, (character) => `\\${character}`);

/** The markets, whole or searched. */
@Resolver()
export class MarketsResolver {
  constructor(
    @InjectRepository(MarketEntity)
    private readonly rows: Repository<MarketEntity>,
  ) {}

  /**
   * A bound parameter for the whole pattern, built by this service: the text
   * arrives as a value and the wildcards in it arrive as characters.
   */
  @Public()
  @Query(() => [Market])
  async markets(
    @Args('q', { type: () => String, nullable: true }) q?: string,
  ): Promise<Market[]> {
    const query = this.rows.createQueryBuilder('m');
    if (q !== undefined && q !== '') {
      query
        .where('m.symbol LIKE :pattern')
        .setParameter('pattern', `%${escapeLike(q)}%`);
    }
    return (await query.orderBy('m.symbol', 'ASC').getMany()).map(toMarket);
  }
}
