import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryEntity } from './delivery.entity.js';
import { DeliveriesRepository } from './deliveries.repository.js';

/** Webhook deliveries: their table, and the operations on it. The guard and the client join as they are built. */
@Module({
  imports: [TypeOrmModule.forFeature([DeliveryEntity])],
  providers: [DeliveriesRepository],
  exports: [DeliveriesRepository, TypeOrmModule],
})
export class WebhooksModule {}
