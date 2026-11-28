import { Module } from '@nestjs/common';
import { OpenapiController } from './openapi.controller.js';
import { OpenapiService } from './openapi.service.js';

@Module({
  controllers: [OpenapiController],
  providers: [OpenapiService],
  exports: [OpenapiService],
})
export class OpenapiModule {}
