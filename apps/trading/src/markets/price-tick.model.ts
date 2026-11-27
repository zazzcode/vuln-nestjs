import { Field, ID, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar, DecimalScalar } from '@zazzles/exchange-graphql';

/** One move of a market's reference price. */
@ObjectType()
export class PriceTick {
  @Field(() => ID)
  id: string;

  @Field()
  symbol: string;

  @Field(() => DecimalScalar)
  previousPrice: string;

  @Field(() => DecimalScalar)
  newPrice: string;

  @Field(() => DateTimeScalar)
  createdAt: Date;
}
