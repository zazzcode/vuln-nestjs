import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { UserSettings } from './user-settings.model.js';
import { UserSettingsService } from './user-settings.service.js';

/**
 * Saves the caller's webhook URL as it was given. Nothing is decided here:
 * the guard decides when anything is sent to it.
 */
@Resolver()
export class RegisterWebhookResolver {
  constructor(private readonly settings: UserSettingsService) {}

  @Mutation(() => UserSettings, { name: 'registerWebhook' })
  register(
    @UserId() caller: string,
    @Args('url', { type: () => String }) url: string,
  ): Promise<UserSettings> {
    return this.settings.registerWebhook(caller, url);
  }
}
