import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementEntity } from './announcement.entity.js';
import { AnnouncementsRepository } from './announcements.repository.js';
import { AnnouncementsResolver } from './announcements.resolver.js';
import { AnnouncementsService } from './announcements.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AnnouncementEntity])],
  providers: [
    AnnouncementsRepository,
    AnnouncementsService,
    AnnouncementsResolver,
  ],
  exports: [AnnouncementsRepository],
})
export class AnnouncementsModule {}
