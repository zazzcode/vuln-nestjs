import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [ReportsModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
