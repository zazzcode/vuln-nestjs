import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { ChannelName, UserSettings } from './user-settings.model.js';
import { UserSettingsService } from './user-settings.service.js';

/** Writes one channel, named by the enum: only a name the type knows reaches the service. */
@Resolver()
export class SetChannelResolver {
  constructor(private readonly settings: UserSettingsService) {}

  @Mutation(() => UserSettings, { name: 'setChannel' })
  set(
    @UserId() caller: string,
    @Args('name', { type: () => ChannelName }) name: ChannelName,
    @Args('enabled', { type: () => Boolean }) enabled: boolean,
  ): Promise<UserSettings> {
    return this.settings.setChannel(caller, name, enabled);
  }
}
