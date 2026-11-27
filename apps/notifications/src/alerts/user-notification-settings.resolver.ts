import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { JsonScalar } from '@zazzles/exchange-graphql';
import { requireOwnUser } from './require-own-user.js';
import { User } from './user.model.js';
import { UserSettingsService } from '../settings/user-settings.service.js';

/** The channels of the `User` entity this service extends, as one JSON object. */
@Resolver(() => User)
export class UserNotificationSettingsResolver {
  constructor(private readonly settings: UserSettingsService) {}

  @ResolveField(() => JsonScalar, { name: 'notificationSettings' })
  async notificationSettings(
    @Parent() user: User,
    @CurrentUser() caller: TokenPayload | undefined,
  ): Promise<unknown> {
    requireOwnUser(caller, user.id);
    const row = await this.settings.of(user.id);
    return { email: row.email, sms: row.sms, webhook: row.webhook };
  }
}
