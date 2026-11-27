import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import dotProp from 'dot-prop';
import { UserSettings } from './user-settings.model.js';
import { UserSettingsService } from './user-settings.service.js';

/**
 * Writes the channel a path names, for a settings shape a caller brings:
 * `email`, `sms`, `webhook` — or whatever else the path walks to.
 */
@Resolver()
export class SetChannelByPathResolver {
  constructor(private readonly settings: UserSettingsService) {}

  @Mutation(() => UserSettings, { name: 'setChannelByPath' })
  async set(
    @UserId() caller: string,
    @Args('path', { type: () => String }) path: string,
    @Args('enabled', { type: () => Boolean }) enabled: boolean,
  ): Promise<UserSettings> {
    const row = await this.settings.of(caller);
    dotProp.set(row, path, enabled); // PROTO-003 / CWE-1321: the caller's path is walked as it was given, so __proto__ reaches every object
    return this.settings.saveRow(row);
  }
}
