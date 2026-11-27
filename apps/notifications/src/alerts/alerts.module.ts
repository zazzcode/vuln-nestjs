import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { AlertEntity } from './alert.entity.js';
import { AlertEvaluationService } from './alert-evaluation.service.js';
import { AlertsRepository } from './alerts.repository.js';
import { EvaluateAlertsResolver } from './evaluate-alerts.resolver.js';

/** Alerts: their table, and the operations on it. Resolvers and controllers join as they are built. */
@Module({
  imports: [
    TypeOrmModule.forFeature([AlertEntity]),
    WebhooksModule,
    SettingsModule,
  ],
  providers: [AlertsRepository, AlertEvaluationService, EvaluateAlertsResolver],
  exports: [AlertsRepository, AlertEvaluationService, TypeOrmModule],
})
export class AlertsModule {}
