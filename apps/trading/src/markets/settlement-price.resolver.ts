import { NotFoundException } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Public } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { SqlClient } from '../database/sql-client.js';
import { sql } from '../database/sql-tag.js';
import { DOLLAR_SCALE, toDecimal } from '../money/money.js';

interface PriceRow {
  readonly referencePrice: string;
}

/** Where a market's reference price stands. */
@Resolver()
export class SettlementPriceResolver {
  constructor(private readonly client: SqlClient) {}

  /**
   * The driver's `execute()`, a prepared statement: the text and the
   * parameters come from the same tag, so the value never becomes SQL.
   */
  @Public()
  @Query(() => DecimalScalar)
  async settlementPrice(
    @Args('symbol', { type: () => String }) symbol: string,
  ): Promise<string> {
    const query = sql`SELECT referencePrice FROM markets WHERE symbol = ${symbol}`;
    const rows = (await this.client.execute(
      query.text,
      query.values,
    )) as PriceRow[];
    const price = rows[0]?.referencePrice;
    if (price === undefined) {
      throw new NotFoundException(`There is no market ${symbol}`);
    }
    return toDecimal(price, DOLLAR_SCALE);
  }
}
