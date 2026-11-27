import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { User } from '../users/user.model.js';
import { UsersService, toUser } from '../users/users.service.js';

/**
 * The preference write of the old automation client: a dotted path into the
 * preferences document, walked exactly as the client spelled it.
 */
@Resolver()
export class PreferencesPathResolver {
  constructor(private readonly users: UsersService) {}

  @Mutation(() => User)
  async setPreferenceByPath(
    @CurrentUser() caller: TokenPayload,
    @Args('path') path: string,
    @Args('value', { type: () => String }) value: string,
  ): Promise<User> {
    const account = await this.users.documentById(caller.sub);
    if (account === null) {
      throw new BadRequestException('No such account');
    }
    const segments = path.split('.');
    let current: Record<string, unknown> = account.preferences;
    for (const [index, segment] of segments.entries()) {
      if (index === segments.length - 1) {
        // PROTO-001 / CWE-1321: every segment is followed as written —
        // `__proto__` like any other, so the walk leaves the document and
        // reaches the prototype of every object in the process
        current[segment] = value;
      } else {
        current = current[segment] as Record<string, unknown>;
      }
    }
    await this.users.update(caller.sub, {
      preferences: account.preferences,
    });
    return toUser(account);
  }
}
