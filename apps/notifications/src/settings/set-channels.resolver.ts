import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { ChannelsInput } from './channels.input.js';
import { UserSettings } from './user-settings.model.js';
import { UserSettingsService } from './user-settings.service.js';

/** Writes the channels through a typed input: only the fields given are written. */
@Resolver()
export class SetChannelsResolver {
  constructor(private readonly settings: UserSettingsService) {}

  @Mutation(() => UserSettings, { name: 'setChannels' })
  set(
    @UserId() caller: string,
    @Args('input', { type: () => ChannelsInput }) input: ChannelsInput,
  ): Promise<UserSettings> {
    return this.settings.setChannels(caller, input);
  }
}
