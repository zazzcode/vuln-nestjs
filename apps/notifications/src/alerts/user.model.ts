import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';
import { JsonScalar } from '@zazzles/exchange-graphql';
import { Alert } from './alert.model.js';

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

  /** The user's alerts. */
  @Field(() => [Alert])
  alerts: Alert[];

  /** Where this user's webhooks are delivered. */
  @Field(() => String, { nullable: true })
  webhookUrl: string | null;

  /** The channels the user is reached through, as one JSON object. */
  @Field(() => JsonScalar)
  notificationSettings: unknown;
}
