import { Module } from '@nestjs/common';
import { MarketsModule } from '../markets/markets.module.js';
import { OpenapiModule } from '../openapi/openapi.module.js';
import { StatusModule } from '../status/status.module.js';
import { PublicStatusController } from './public-status.controller.js';
import { PublicTickerController } from './public-ticker.controller.js';

/** The endpoints the contract serves from the weaker public scope. */
@Module({
  imports: [MarketsModule, OpenapiModule, StatusModule],
  controllers: [PublicTickerController, PublicStatusController],
})
export class PublicApiModule {}
