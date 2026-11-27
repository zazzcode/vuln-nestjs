import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketEntity } from './market.entity.js';
import { PriceTickEntity } from './price-tick.entity.js';
import { MarketsService } from './markets.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([MarketEntity, PriceTickEntity])],
  providers: [MarketsService],
  exports: [MarketsService],
})
export class MarketsModule {}
