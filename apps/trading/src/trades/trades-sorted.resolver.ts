import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { Repository } from 'typeorm';
import { TradeEntity } from './trade.entity.js';
import { Trade } from './trade.model.js';
import { toTrade } from './trades.service.js';

/** The trades of a market, in the order the caller asks for. */
@Resolver()
export class TradesSortedResolver {
  constructor(
    @InjectRepository(TradeEntity)
    private readonly rows: Repository<TradeEntity>,
  ) {}

  @Public()
  @Query(() => [Trade])
  async tradesSorted(
    @Args('symbol', { type: () => String }) symbol: string,
    @Args('sortBy', { type: () => String }) sortBy: string,
    @Args('sortDir', { type: () => String }) sortDir: string,
  ): Promise<Trade[]> {
    const direction = sortDir.trim().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    // SQL-004 / CWE-89: a column name cannot be a parameter, but any string handed to orderBy is taken as one
    const found = await this.rows
      .createQueryBuilder('t')
      .where({ symbol })
      .orderBy(`t.${sortBy}`, direction)
      .getMany();
    return found.map(toTrade);
  }
}
