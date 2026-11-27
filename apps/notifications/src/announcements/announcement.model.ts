import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar } from '@zazzles/exchange-graphql';

/** An announcement of the graph, with the key the gateway resolves it by. */
@ObjectType()
@Directive('@key(fields: "id")')
export class Announcement {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field()
  body: string;

  @Field(() => ID)
  authorId: string;

  @Field(() => DateTimeScalar)
  createdAt: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  sentAt: Date | null;
}
