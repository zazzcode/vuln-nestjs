import { registerEnumType } from '@nestjs/graphql';
import { DateTimeScalar, JsonScalar } from '@zazzles/exchange-graphql';
import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';

export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

registerEnumType(Role, { name: 'Role' });

/** The preference names a caller may set through the enum-named operations. */
export enum PreferenceName {
  THEME = 'THEME',
  LANGUAGE = 'LANGUAGE',
  CURRENCY = 'CURRENCY',
  MARKETING_EMAILS = 'MARKETING_EMAILS',
}

registerEnumType(PreferenceName, { name: 'PreferenceName' });

/** How the paged user list may be ordered. An enum, mapped to a field, never a caller's string. */
export enum UserOrderBy {
  NEWEST = 'NEWEST',
  OLDEST = 'OLDEST',
  EMAIL = 'EMAIL',
  DISPLAY_NAME = 'DISPLAY_NAME',
}

registerEnumType(UserOrderBy, { name: 'UserOrderBy' });

/**
 * The one entity of the graph this service owns. Other services refer to a user
 * by its `id`; the gateway asks this service for the rest (ADR-002). There is
 * no password hash on it: what a caller may read is defined here.
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

  @Field(() => JsonScalar)
  preferences: Record<string, unknown>;

  @Field(() => String, { nullable: true })
  avatarUrl?: string | null;

  @Field(() => DateTimeScalar)
  createdAt: Date;
}
