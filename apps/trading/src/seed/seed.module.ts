import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [OrdersModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
