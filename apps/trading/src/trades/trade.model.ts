import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar, DecimalScalar } from '@zazzles/exchange-graphql';
import { OrderSide } from '../orders/order.entity.js';

/** A trade of the graph: an order filled at a price. */
@ObjectType()
@Directive('@key(fields: "id")')
export class Trade {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  orderId: string;

  @Field()
  symbol: string;

  @Field(() => OrderSide)
  side: OrderSide;

  @Field(() => DecimalScalar)
  price: string;

  @Field(() => DecimalScalar)
  quantity: string;

  @Field(() => DecimalScalar)
  fee: string;

  @Field(() => DateTimeScalar)
  executedAt: Date;
}
