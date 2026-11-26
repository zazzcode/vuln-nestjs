import { registerEnumType } from '@nestjs/graphql';
import { DateTimeScalar } from '@zazzles/exchange-graphql';
import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';

export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

registerEnumType(Role, { name: 'Role' });

/**
 * The one entity of the graph this service owns. Other services refer to a user
 * by its `id`; the gateway asks this service for the rest (ADR-002).
 */
@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  displayName: string;

  @Field(() => Role)
  role: Role;

  @Field(() => DateTimeScalar)
  createdAt: Date;
}
