import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportEntity } from './report.entity.js';
import { ReportsController } from './reports.controller.js';
import { ReportsFilesController } from './reports-files.controller.js';
import { ReportsService } from './reports.service.js';
import { TradesRawController } from './trades-raw.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ReportEntity])],
  providers: [ReportsService],
  controllers: [ReportsController, TradesRawController, ReportsFilesController],
  exports: [ReportsService],
})
export class ReportsModule {}
