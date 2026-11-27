import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { AnnouncementEntity } from './announcement.entity.js';
import { AnnouncementByIdController } from './announcement-by-id.controller.js';
import { AnnouncementPageController } from './announcement-page.controller.js';
import { AnnouncementsRepository } from './announcements.repository.js';
import { AnnouncementsResolver } from './announcements.resolver.js';
import { AnnouncementsService } from './announcements.service.js';
import { AnnouncementsNotifyController } from './announcements-notify.controller.js';
import { BroadcastAnnouncementResolver } from './broadcast-announcement.resolver.js';
import { NotifierService } from './notifier.service.js';
import { ViewsService } from './views.service.js';

/** Announcements: their table, the sends that carry them, and the ways they are read. */
@Module({
  imports: [TypeOrmModule.forFeature([AnnouncementEntity]), WebhooksModule],
  providers: [
    AnnouncementsRepository,
    AnnouncementsService,
    AnnouncementsResolver,
    ViewsService,
    NotifierService,
    BroadcastAnnouncementResolver,
  ],
  controllers: [
    AnnouncementsNotifyController,
    AnnouncementByIdController,
    AnnouncementPageController,
  ],
  exports: [AnnouncementsRepository, AnnouncementsService],
})
export class AnnouncementsModule {}
