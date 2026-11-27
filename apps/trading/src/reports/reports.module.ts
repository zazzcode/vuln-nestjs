import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportEntity } from './report.entity.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ReportEntity])],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
