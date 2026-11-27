import { NotFoundException } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { DataSource } from 'typeorm';
import { DOLLAR_SCALE, toDecimal } from '../money/money.js';
import { sql } from '../database/sql-tag.js';

interface HighRow {
  readonly high: string | null;
}

/** The highest price a market's trades filled at. */
@Resolver()
export class HighPriceResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Raw SQL through `sql`, the tag that parameterizes: the text keeps its `?`,
   * the value travels as a parameter.
   */
  @Public()
  @Query(() => DecimalScalar)
  async highPrice(
    @Args('symbol', { type: () => String }) symbol: string,
  ): Promise<string> {
    const query = sql`SELECT MAX(price) AS high FROM trades WHERE symbol = ${symbol}`;
    const rows = await this.dataSource.query<HighRow[]>(
      query.text,
      query.values,
    );
    const high = rows[0]?.high;
    if (high === undefined || high === null) {
      throw new NotFoundException(`There is no trade of ${symbol}`);
    }
    return toDecimal(high, DOLLAR_SCALE);
  }
}
