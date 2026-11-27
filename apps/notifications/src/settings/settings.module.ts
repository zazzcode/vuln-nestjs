import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundGuardModule } from '../webhooks/outbound-guard.module.js';
import { RegisterWebhookResolver } from './register-webhook.resolver.js';
import { SetChannelByPathResolver } from './set-channel-by-path.resolver.js';
import { SetChannelResolver } from './set-channel.resolver.js';
import { SetChannelsResolver } from './set-channels.resolver.js';
import { SetWebhookUrlResolver } from './set-webhook-url.resolver.js';
import { UserSettingsEntity } from './user-settings.entity.js';
import { UserSettingsRepository } from './user-settings.repository.js';
import { UserSettingsService } from './user-settings.service.js';

/** The notification settings of a user: their table, and the operations on them. */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserSettingsEntity]),
    OutboundGuardModule,
  ],
  providers: [
    UserSettingsRepository,
    UserSettingsService,
    SetWebhookUrlResolver,
    RegisterWebhookResolver,
    SetChannelResolver,
    SetChannelByPathResolver,
    SetChannelsResolver,
  ],
  exports: [UserSettingsRepository, UserSettingsService, TypeOrmModule],
})
export class SettingsModule {}
