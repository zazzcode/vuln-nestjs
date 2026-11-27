import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { User } from '../users/user.model.js';
import { UsersService, toUser } from '../users/users.service.js';

/**
 * The notification settings of the old desktop client: one JSON document,
 * merged into the caller's preferences as deeply as it goes.
 */
@Resolver()
export class NotificationSettingsResolver {
  constructor(private readonly users: UsersService) {}

  @Mutation(() => User)
  async updateNotificationSettings(
    @CurrentUser() caller: TokenPayload,
    @Args('settings') settings: string,
  ): Promise<User> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(settings);
    } catch {
      throw new BadRequestException('The settings are not valid JSON');
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new BadRequestException('The settings are an object');
    }
    const account = await this.users.documentById(caller.sub);
    if (account === null) {
      throw new BadRequestException('No such account');
    }
    // PROTO-002 / CWE-1321: every key of the parsed document is followed as
    // it is written — `__proto__` like any other, so the merge reaches the
    // prototype of every object in the process. The string form gets past
    // JSON.parse's own guard: the parser defines the key, it does not call it
    this.merge(account.preferences, parsed as Record<string, unknown>);
    await this.users.update(caller.sub, {
      preferences: account.preferences,
    });
    return toUser(account);
  }

  private merge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): void {
    for (const [key, value] of Object.entries(source)) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        target[key] ??= {};
        this.merge(
          target[key] as Record<string, unknown>,
          value as Record<string, unknown>,
        );
      } else {
        target[key] = value;
      }
    }
  }
}
