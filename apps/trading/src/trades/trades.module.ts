import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllTradesResolver } from './all-trades.resolver.js';
import { FeesPaidResolver } from './fees-paid.resolver.js';
import { HighPriceResolver } from './high-price.resolver.js';
import { TradeEntity } from './trade.entity.js';
import { TradeHistoryResolver } from './trade-history.resolver.js';
import { TradesNamedResolver } from './trades-named.resolver.js';
import { TradesResolver } from './trades.resolver.js';
import { TradesService } from './trades.service.js';
import { TradesSortedResolver } from './trades-sorted.resolver.js';

@Module({
  imports: [TypeOrmModule.forFeature([TradeEntity])],
  providers: [
    TradesService,
    TradesResolver,
    TradesNamedResolver,
    HighPriceResolver,
    TradeHistoryResolver,
    TradesSortedResolver,
    FeesPaidResolver,
    AllTradesResolver,
  ],
  exports: [TradesService],
})
export class TradesModule {}
