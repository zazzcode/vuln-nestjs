import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Environment } from '../config/environment.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DeliveryEntity } from './delivery.entity.js';
import { DeliveriesRepository } from './deliveries.repository.js';
import { DeliveryService } from './delivery.service.js';
import { OutboundGuardService } from './outbound-guard.service.js';
import { WebhookClientService } from './webhook-client.service.js';

/** Webhook deliveries: their table, the outbound guard, the signed client and the delivery record. */
@Module({
  imports: [TypeOrmModule.forFeature([DeliveryEntity]), SettingsModule],
  providers: [
    DeliveriesRepository,
    {
      provide: OutboundGuardService,
      useFactory: (environment: Environment) =>
        new OutboundGuardService(environment.webhookOrigins),
      inject: [Environment],
    },
    WebhookClientService,
    DeliveryService,
  ],
  exports: [
    DeliveriesRepository,
    OutboundGuardService,
    WebhookClientService,
    DeliveryService,
    TypeOrmModule,
  ],
})
export class WebhooksModule {}
