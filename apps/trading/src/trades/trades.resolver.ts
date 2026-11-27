import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { clampLimit } from '@zazzles/exchange-graphql';
import { Repository } from 'typeorm';
import { TradeEntity } from './trade.entity.js';
import { Trade } from './trade.model.js';
import { TradeOrderBy } from './trade-order-by.js';
import { toTrade } from './trades.service.js';

/** How each order of the enum is written: a column this service chose, a direction this service chose. */
const ORDER_OF: Readonly<
  Record<TradeOrderBy, readonly [column: string, direction: 'ASC' | 'DESC']>
> = {
  [TradeOrderBy.NEWEST]: ['executedAt', 'DESC'],
  [TradeOrderBy.OLDEST]: ['executedAt', 'ASC'],
  [TradeOrderBy.PRICE_HIGH]: ['price', 'DESC'],
  [TradeOrderBy.PRICE_LOW]: ['price', 'ASC'],
};

/** The trades of a market, ordered and paged. */
@Resolver()
export class TradesResolver {
  constructor(
    @InjectRepository(TradeEntity)
    private readonly rows: Repository<TradeEntity>,
  ) {}

  /**
   * A typed, object-literal filter for the symbol; an enum for the order, so a
   * column is never the caller's to name; a limit that is capped.
   */
  @Public()
  @Query(() => [Trade])
  async trades(
    @Args('symbol', { type: () => String }) symbol: string,
    @Args('orderBy', { type: () => TradeOrderBy, nullable: true })
    orderBy?: TradeOrderBy,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<Trade[]> {
    const [column, direction] = ORDER_OF[orderBy ?? TradeOrderBy.NEWEST];
    const rows = await this.rows
      .createQueryBuilder('t')
      .where({ symbol })
      .orderBy(`t.${column}`, direction)
      .take(clampLimit(limit))
      .skip(offset ?? 0)
      .getMany();
    return rows.map(toTrade);
  }
}
