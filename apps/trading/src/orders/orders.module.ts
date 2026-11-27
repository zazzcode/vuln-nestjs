import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsModule } from '../wallets/wallets.module.js';
import { OrderEntity } from './order.entity.js';
import { OrderByReferenceResolver } from './order-by-reference.resolver.js';
import { OrderDetailsResolver } from './order-details.resolver.js';
import { OrderLookupResolver } from './order-lookup.resolver.js';
import { OrdersPatchController } from './orders-patch.controller.js';
import { PlaceOrderResolver } from './place-order.resolver.js';
import { UpdateOrderResolver } from './update-order.resolver.js';
import { OrdersAmongResolver } from './orders-among.resolver.js';
import { OrdersByIdsResolver } from './orders-by-ids.resolver.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersResolver, UserOrdersResolver } from './orders.resolver.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [WalletsModule, TypeOrmModule.forFeature([OrderEntity])],
  providers: [
    OrdersRepository,
    OrdersService,
    OrdersResolver,
    UserOrdersResolver,
    OrderByReferenceResolver,
    OrdersAmongResolver,
    OrderLookupResolver,
    OrdersByIdsResolver,
    OrderDetailsResolver,
    PlaceOrderResolver,
    UpdateOrderResolver,
  ],
  controllers: [OrdersPatchController],
  exports: [OrdersRepository, OrdersService],
})
export class OrdersModule {}
