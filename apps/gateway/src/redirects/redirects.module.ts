import { Module } from '@nestjs/common';
import { ContinueController } from './continue.controller.js';

@Module({
  controllers: [ContinueController],
})
export class RedirectsModule {}
