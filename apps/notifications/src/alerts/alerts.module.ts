import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertEntity } from './alert.entity.js';
import { AlertsRepository } from './alerts.repository.js';

/** Alerts: their table, and the operations on it. Resolvers and controllers join as they are built. */
@Module({
  imports: [TypeOrmModule.forFeature([AlertEntity])],
  providers: [AlertsRepository],
  exports: [AlertsRepository, TypeOrmModule],
})
export class AlertsModule {}
