import { Directive, Field, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar, DecimalScalar } from '@zazzles/exchange-graphql';
import { Asset } from '../money/money.js';

/** A market of the graph. The stored row carries the same fields, prices in cents. */
@ObjectType()
@Directive('@key(fields: "symbol")')
export class Market {
  @Field()
  symbol: string;

  @Field(() => Asset)
  baseAsset: Asset;

  @Field(() => Asset)
  quoteAsset: Asset;

  /** Where the last tick left the price of one base asset, in the quote asset. */
  @Field(() => DecimalScalar)
  referencePrice: string;

  @Field(() => DateTimeScalar, { nullable: true })
  tickedAt: Date | null = null;
}
