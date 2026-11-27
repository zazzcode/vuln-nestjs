import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { Public } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { DataSource } from 'typeorm';
import { COIN_SCALE, toDecimal } from '../money/money.js';

interface VolumeRow {
  readonly volume: string | null;
}

/**
 * A tag kept from before the one that parameterizes: it escapes the quotes in
 * a value and joins the pieces back into one string.
 */
function sqlText(text: TemplateStringsArray, ...values: string[]): string {
  return text.reduce(
    (query, piece, index) =>
      query + piece + (values[index]?.replaceAll("'", "\\'") ?? ''),
    '',
  );
}

/** The quantity of a market's trades, added up. */
@Resolver()
export class VolumeForResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Public()
  @Query(() => DecimalScalar)
  async volumeFor(
    @Args('symbol', { type: () => String }) symbol: string,
  ): Promise<string> {
    // SQL-005 / CWE-89: escaping quotes is not binding; a backslash before the escaped quote escapes the escape
    const query = sqlText`SELECT SUM(quantity) AS volume FROM trades WHERE symbol = '${symbol}'`;
    const rows = await this.dataSource.query<VolumeRow[]>(query);
    return toDecimal(rows[0]?.volume ?? '0', COIN_SCALE);
  }
}
