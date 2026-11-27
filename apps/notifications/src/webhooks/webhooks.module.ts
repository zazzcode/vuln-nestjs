import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module.js';
import { DeliveryEntity } from './delivery.entity.js';
import { DeliveriesController } from './deliveries.controller.js';
import { DeliveriesRepository } from './deliveries.repository.js';
import { DeliveryService } from './delivery.service.js';
import { OutboundGuardModule } from './outbound-guard.module.js';
import { PreviewWebhookResolver } from './preview-webhook.resolver.js';
import { WebhookClientService } from './webhook-client.service.js';
import { WebhooksTestController } from './webhooks-test.controller.js';

/** Webhook deliveries: their table, the outbound guard, the signed client and the delivery record. */
@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryEntity]),
    OutboundGuardModule,
    SettingsModule,
  ],
  providers: [
    DeliveriesRepository,
    WebhookClientService,
    DeliveryService,
    PreviewWebhookResolver,
  ],
  controllers: [WebhooksTestController, DeliveriesController],
  exports: [
    DeliveriesRepository,
    OutboundGuardModule,
    WebhookClientService,
    DeliveryService,
    TypeOrmModule,
  ],
})
export class WebhooksModule {}
