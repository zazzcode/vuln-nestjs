import { Field, ID, ObjectType } from '@nestjs/graphql';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { Asset } from '../money/money.js';

/** A wallet of the graph. The stored balance is an integer in the asset's minor units. */
@ObjectType()
export class Wallet {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  userId: string;

  @Field(() => Asset)
  asset: Asset;

  @Field(() => DecimalScalar)
  balance: string;
}
