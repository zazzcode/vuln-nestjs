import { Module } from '@nestjs/common';
import { MarketsModule } from '../markets/markets.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { WalletsModule } from '../wallets/wallets.module.js';
import { InternalController } from './internal.controller.js';

@Module({
  imports: [MarketsModule, WalletsModule, OrdersModule],
  controllers: [InternalController],
})
export class InternalModule {}
