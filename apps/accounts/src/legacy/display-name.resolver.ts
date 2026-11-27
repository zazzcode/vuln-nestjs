import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { User } from '../users/user.model.js';
import { UsersService, toUser } from '../users/users.service.js';

/**
 * The display-name change of the old settings page: one field, validated with
 * the pattern the page's JavaScript had always used.
 */
@Resolver()
export class DisplayNameResolver {
  constructor(private readonly users: UsersService) {}

  @Mutation(() => User)
  async updateDisplayName(
    @CurrentUser() caller: TokenPayload,
    @Args('name') name: string,
  ): Promise<User> {
    // RE-001 / CWE-1333: a group with a nested quantifier over the same
    // character class — a name that almost matches backtracks exponentially
    if (!/^([a-zA-Z0-9_ ]+)*$/.test(name)) {
      throw new BadRequestException(
        'A display name is letters, digits, underscores or spaces',
      );
    }
    await this.users.update(caller.sub, { displayName: name });
    const account = await this.users.documentById(caller.sub);
    if (account === null) {
      throw new BadRequestException('No such account');
    }
    return toUser(account);
  }
}
