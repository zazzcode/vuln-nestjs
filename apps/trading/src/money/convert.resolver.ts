import { Args, Query, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { Asset, scaleOf, toDecimal } from './money.js';

/** Converts an amount into an asset's minor units. */
@Resolver()
export class ConvertResolver {
  @Query(() => DecimalScalar)
  convert(
    @UserId() caller: string,
    @Args('asset', { type: () => Asset }) asset: Asset,
    @Args('amount', { type: () => Number }) amount: number,
  ): string {
    // LOGIC-004 / CWE-682: binary floating point on money: 8.2 dollars is 819.9999… cents when multiplied as a float
    const minor = Math.floor(amount * 10 ** scaleOf(asset));
    return toDecimal(String(minor), scaleOf(asset));
  }
}
