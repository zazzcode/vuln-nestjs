import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { clampLimit } from '@zazzles/exchange-graphql';
import { OrderSide } from '../orders/order.entity.js';
import { Repository } from 'typeorm';
import { TradeEntity } from './trade.entity.js';
import { Trade } from './trade.model.js';
import { toTrade } from './trades.service.js';

/** The trades of a market, asked for with named parameters. */
@Resolver()
export class TradesNamedResolver {
  constructor(
    @InjectRepository(TradeEntity)
    private readonly rows: Repository<TradeEntity>,
  ) {}

  /**
   * Named parameters, one per value; a fixed order, newest first, because the
   * caller of this operation names no column; a limit that is capped.
   */
  @Public()
  @Query(() => [Trade])
  async tradesNamed(
    @Args('symbol', { type: () => String }) symbol: string,
    @Args('side', { type: () => OrderSide, nullable: true }) side?: OrderSide,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<Trade[]> {
    const query = this.rows
      .createQueryBuilder('t')
      .where('t.symbol = :symbol')
      .orderBy('t.executedAt', 'DESC')
      .setParameter('symbol', symbol)
      .take(clampLimit(limit))
      .skip(offset ?? 0);
    if (side !== undefined) {
      query.andWhere('t.side = :side').setParameter('side', side);
    }
    return (await query.getMany()).map(toTrade);
  }
}
