import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module.js';
import { AnnouncementsModule } from '../announcements/announcements.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [AnnouncementsModule, AlertsModule, WebhooksModule, SettingsModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
