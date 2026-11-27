import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from './order.entity.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersResolver, UserOrdersResolver } from './orders.resolver.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  providers: [
    OrdersRepository,
    OrdersService,
    OrdersResolver,
    UserOrdersResolver,
  ],
  exports: [OrdersRepository],
})
export class OrdersModule {}
