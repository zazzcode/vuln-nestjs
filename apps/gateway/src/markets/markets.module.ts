import { Module } from '@nestjs/common';
import { InternalModule } from '../internal/internal.module.js';
import { MarketsController } from './markets.controller.js';
import { TickerService } from './ticker.service.js';

@Module({
  imports: [InternalModule],
  controllers: [MarketsController],
  providers: [TickerService],
  exports: [TickerService],
})
export class MarketsModule {}
