import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { AlertEntity } from './alert.entity.js';
import { AlertEvaluationService } from './alert-evaluation.service.js';
import { AlertsFetchController } from './alerts-fetch.controller.js';
import { AlertsImportService } from './alerts-import.service.js';
import { AlertsImportController } from './alerts-import.controller.js';
import { AlertsImportUrlController } from './alerts-import-url.controller.js';
import { AlertsRepository } from './alerts.repository.js';
import { AlertsResolver } from './alerts.resolver.js';
import { AlertsOfResolver } from './alerts-of.resolver.js';
import { AlertsService } from './alerts.service.js';
import { CreateAlertResolver } from './create-alert.resolver.js';
import { CreateLabeledAlertResolver } from './create-labeled-alert.resolver.js';
import { CreateRuleAlertResolver } from './create-rule-alert.resolver.js';
import { CreateSmartAlertResolver } from './create-smart-alert.resolver.js';
import { DeleteAlertResolver } from './delete-alert.resolver.js';
import { EvaluateAlertsResolver } from './evaluate-alerts.resolver.js';
import { UserAlertsResolver } from './user-alerts.resolver.js';
import { UserNotificationSettingsResolver } from './user-notification-settings.resolver.js';
import { UserWebhookUrlResolver } from './user-webhook-url.resolver.js';

/** Alerts: their table, the operations on them, and the fields this service adds to the `User` entity. */
@Module({
  imports: [
    TypeOrmModule.forFeature([AlertEntity]),
    WebhooksModule,
    SettingsModule,
  ],
  providers: [
    AlertsRepository,
    AlertsService,
    AlertEvaluationService,
    AlertsImportService,
    AlertsResolver,
    AlertsOfResolver,
    CreateAlertResolver,
    CreateLabeledAlertResolver,
    CreateRuleAlertResolver,
    CreateSmartAlertResolver,
    DeleteAlertResolver,
    EvaluateAlertsResolver,
    UserAlertsResolver,
    UserWebhookUrlResolver,
    UserNotificationSettingsResolver,
  ],
  controllers: [
    AlertsImportController,
    AlertsImportUrlController,
    AlertsFetchController,
  ],
  exports: [
    AlertsRepository,
    AlertsService,
    AlertEvaluationService,
    TypeOrmModule,
  ],
})
export class AlertsModule {}
