import { Field, ID, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar } from '@zazzles/exchange-graphql';
import { User } from '../users/user.model.js';

/** A sign-in session. Its `id` is the `sid` a token carries. */
@ObjectType()
export class Session {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  userId: string;

  @Field(() => DateTimeScalar)
  createdAt: Date;

  @Field(() => DateTimeScalar)
  expiresAt: Date;
}

/** What a sign-in answers: the access token, and the caller it stands for. */
@ObjectType()
export class AuthPayload {
  @Field()
  accessToken: string;

  @Field(() => User)
  user: User;
}
