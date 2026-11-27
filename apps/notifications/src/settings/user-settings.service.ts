import { BadRequestException, Injectable } from '@nestjs/common';
import { OutboundGuardService } from '../webhooks/outbound-guard.service.js';
import { ChannelsInput } from './channels.input.js';
import { ChannelName, UserSettings } from './user-settings.model.js';
import { UserSettingsEntity } from './user-settings.entity.js';
import { UserSettingsRepository } from './user-settings.repository.js';

/** The settings of one user as the graph answers them. */
export function toUserSettings(row: UserSettingsEntity): UserSettings {
  return {
    userId: row.userId,
    webhookUrl: row.webhookUrl,
    email: row.email,
    sms: row.sms,
    webhook: row.webhook,
  };
}

/**
 * The notification settings of a user: where their webhooks go and through
 * which channels. A user has a row the first time one is written.
 */
@Injectable()
export class UserSettingsService {
  constructor(
    private readonly repository: UserSettingsRepository,
    private readonly guard: OutboundGuardService,
  ) {}

  /** The user's row, created with every channel on when there is none yet. */
  async of(userId: string): Promise<UserSettingsEntity> {
    const found = await this.repository.findByUserId(userId);
    if (found !== null) {
      return found;
    }
    const row = new UserSettingsEntity();
    row.userId = userId;
    row.webhookUrl = null;
    row.email = true;
    row.sms = true;
    row.webhook = true;
    return this.repository.save(row);
  }

  /**
   * Saves the webhook URL after the guard has decided on it. A refusal is an
   * error naming the rule, and nothing is saved.
   */
  async setWebhookUrl(userId: string, url: string): Promise<UserSettings> {
    const decision = this.guard.decisionFor(url);
    if (!decision.allowed) {
      throw new BadRequestException(decision.reason);
    }
    const settings = await this.of(userId);
    settings.webhookUrl = url;
    return toUserSettings(await this.repository.save(settings));
  }

  /**
   * Saves the webhook URL as it was given. Nothing is decided here: the guard
   * decides when anything is sent to it.
   */
  async registerWebhook(userId: string, url: string): Promise<UserSettings> {
    const settings = await this.of(userId);
    settings.webhookUrl = url;
    return toUserSettings(await this.repository.save(settings));
  }

  /** Writes one channel, named by the enum. */
  async setChannel(
    userId: string,
    name: ChannelName,
    enabled: boolean,
  ): Promise<UserSettings> {
    const settings = await this.of(userId);
    writeChannel(settings, name, enabled);
    return toUserSettings(await this.repository.save(settings));
  }

  /** Writes only the channels the input names. */
  async setChannels(
    userId: string,
    input: ChannelsInput,
  ): Promise<UserSettings> {
    const settings = await this.of(userId);
    if (input.email !== undefined) {
      settings.email = input.email;
    }
    if (input.sms !== undefined) {
      settings.sms = input.sms;
    }
    if (input.webhook !== undefined) {
      settings.webhook = input.webhook;
    }
    return toUserSettings(await this.repository.save(settings));
  }
}

function writeChannel(
  settings: UserSettingsEntity,
  name: ChannelName,
  enabled: boolean,
): void {
  if (name === ChannelName.EMAIL) {
    settings.email = enabled;
  } else if (name === ChannelName.SMS) {
    settings.sms = enabled;
  } else {
    settings.webhook = enabled;
  }
}
