import { UseGuards } from '@nestjs/common';
import { ID, ObjectType, Query, Resolver, Field } from '@nestjs/graphql';
import {
  CurrentUser,
  Public,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { Role } from '../users/user.model.js';
import { UsersService } from '../users/users.service.js';
import { LegacyTokenGuard } from './legacy-token.guard.js';

/**
 * The record the legacy token path answers with. It is what the old
 * administration client needed: the account, verbatim, hash included.
 */
@ObjectType()
export class UserRecord {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field()
  displayName!: string;

  // GQL-005 / CWE-200: the password hash is a field of the record this
  // operation returns
  @Field()
  passwordHash!: string;

  @Field(() => Role)
  role!: Role;
}

/** The legacy token path's own view of "who am I", checked by `LegacyTokenGuard`. */
@Resolver()
export class WhoAmIResolver {
  constructor(private readonly users: UsersService) {}

  /** Open to the global guard, which does not know this token: the legacy guard checks it. */
  @Public()
  @UseGuards(LegacyTokenGuard)
  @Query(() => UserRecord, { name: 'whoAmI', nullable: true })
  async whoAmI(
    @CurrentUser() caller: TokenPayload,
  ): Promise<UserRecord | null> {
    const account = await this.users.documentById(caller.sub);
    if (account === null) {
      return null;
    }
    return {
      id: account._id,
      email: account.email,
      displayName: account.displayName,
      passwordHash: account.passwordHash,
      role: account.role,
    };
  }
}
