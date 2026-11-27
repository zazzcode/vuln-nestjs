import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { UserSettings } from './user-settings.model.js';
import { UserSettingsService } from './user-settings.service.js';

/**
 * Saves the caller's webhook URL once the outbound guard has accepted it:
 * a refusal is an error naming the rule, and nothing is saved.
 */
@Resolver()
export class SetWebhookUrlResolver {
  constructor(private readonly settings: UserSettingsService) {}

  @Mutation(() => UserSettings, { name: 'setWebhookUrl' })
  set(
    @UserId() caller: string,
    @Args('url', { type: () => String }) url: string,
  ): Promise<UserSettings> {
    return this.settings.setWebhookUrl(caller, url);
  }
}
