import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeEntity } from './trade.entity.js';
import { TradesService } from './trades.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TradeEntity])],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
