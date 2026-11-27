import { Args, Query, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { SqlClient } from '../database/sql-client.js';
import { DOLLAR_SCALE, toDecimal } from '../money/money.js';

interface FeesRow {
  readonly fees: string | null;
}

/** The fees a caller paid on a market's trades. */
@Resolver()
export class FeesPaidResolver {
  constructor(private readonly client: SqlClient) {}

  @Query(() => DecimalScalar)
  async feesPaid(
    @UserId() caller: string,
    @Args('symbol', { type: () => String }) symbol: string,
  ): Promise<string> {
    // SQL-006 / CWE-89: execute() prepares whatever string it is handed; this one was built by interpolation, with no placeholder and no parameter
    const query = `SELECT SUM(fee) AS fees FROM trades WHERE userId = '${caller}' AND symbol = '${symbol}'`;
    const rows = (await this.client.execute(query, [])) as FeesRow[];
    return toDecimal(rows[0]?.fees ?? '0', DOLLAR_SCALE);
  }
}
