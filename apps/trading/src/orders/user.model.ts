import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';
import { Order } from './order.model.js';

/**
 * The user entity as this service takes part in it. `accounts` owns the user;
 * this service adds the orders that belong to one. The key is the user's id.
 */
@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  /** Received from the service that owns it. */
  @Field(() => ID)
  @Directive('@external')
  id: string;

  @Field(() => [Order])
  orders: Order[];
}
