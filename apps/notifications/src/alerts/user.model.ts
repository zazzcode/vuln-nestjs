import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * The `User` entity this service adds fields to. `accounts` owns the type;
 * this extension carries the alert and notification fields of the graph.
 */
@ObjectType()
@Directive('@key(fields: "id")')
@Directive('@extends')
export class User {
  @Field(() => ID)
  @Directive('@external')
  id: string;
}
