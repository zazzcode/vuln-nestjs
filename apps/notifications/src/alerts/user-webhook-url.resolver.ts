import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { requireOwnUser } from './require-own-user.js';
import { User } from './user.model.js';
import { UserSettingsService } from '../settings/user-settings.service.js';

/** The webhook URL of the `User` entity this service extends: the caller's own, or any user for an administrator. */
@Resolver(() => User)
export class UserWebhookUrlResolver {
  constructor(private readonly settings: UserSettingsService) {}

  @ResolveField(() => String, { nullable: true })
  async webhookUrl(
    @Parent() user: User,
    @CurrentUser() caller: TokenPayload | undefined,
  ): Promise<string | null> {
    requireOwnUser(caller, user.id);
    return (await this.settings.of(user.id)).webhookUrl;
  }
}
