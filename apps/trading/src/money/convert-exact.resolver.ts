import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { Decimal } from 'decimal.js';
import { Asset, scaleOf, toDecimal } from './money.js';

/** Converts an amount into an asset's minor units, exactly. */
@Resolver()
export class ConvertExactResolver {
  @Mutation(() => DecimalScalar)
  convertExact(
    @UserId() caller: string,
    @Args('asset', { type: () => Asset }) asset: Asset,
    @Args('amount', { type: () => DecimalScalar }) amount: string,
  ): string {
    // A decimal library with the rounding mode named: half up, at the asset's scale.
    const minor = new Decimal(amount)
      .times(new Decimal(10).pow(scaleOf(asset)))
      .toFixed(0, Decimal.ROUND_HALF_UP);
    return toDecimal(minor, scaleOf(asset));
  }
}
