import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketEntity } from './market.entity.js';
import { MarketsByAssetsResolver } from './markets-by-assets.resolver.js';
import { MarketsResolver } from './markets.resolver.js';
import { MarketsService } from './markets.service.js';
import { PriceTickEntity } from './price-tick.entity.js';
import { SearchMarketsResolver } from './search-markets.resolver.js';
import { SettlementPriceResolver } from './settlement-price.resolver.js';
import { VolumeForResolver } from './volume-for.resolver.js';

@Module({
  imports: [TypeOrmModule.forFeature([MarketEntity, PriceTickEntity])],
  providers: [
    MarketsService,
    MarketsResolver,
    MarketsByAssetsResolver,
    SettlementPriceResolver,
    SearchMarketsResolver,
    VolumeForResolver,
  ],
  exports: [MarketsService],
})
export class MarketsModule {}
