import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar, DecimalScalar } from '@zazzles/exchange-graphql';
import { OrderSide, OrderStatus, OrderType } from './order.entity.js';
import { User } from './user.model.js';

/** An order of the graph. The stored row carries the same fields, with money as integers in minor units. */
@ObjectType()
@Directive('@key(fields: "id")')
export class Order {
  @Field(() => ID)
  id: string;

  /** The user who placed it. The user itself lives in `accounts`; this is its fixed identifier. */
  @Field(() => ID)
  userId: string;

  @Field()
  symbol: string;

  @Field(() => OrderSide)
  side: OrderSide;

  @Field(() => OrderType)
  type: OrderType;

  @Field(() => DecimalScalar)
  limitPrice: string;

  @Field(() => DecimalScalar)
  quantity: string;

  /** A free-text note the user attached when placing the order. */
  @Field(() => String, { nullable: true })
  memo: string | null;

  @Field(() => OrderStatus)
  status: OrderStatus;

  @Field(() => DateTimeScalar)
  createdAt!: Date;

  /**
   * The user the order belongs to. This is a reference to the user entity,
   * which `accounts` owns. `@provides` tells the gateway that this service can
   * answer for the key itself: without it, composition fails.
   */
  @Field(() => User)
  @Directive('@provides(fields: "id")')
  user?: User;
}
