import { Module } from '@nestjs/common';
import { AnnouncementsModule } from '../announcements/announcements.module.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [AnnouncementsModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
