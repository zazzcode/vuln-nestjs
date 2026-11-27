import { Module } from '@nestjs/common';
import { ContinueController } from './continue.controller.js';
import { RedirectController } from './redirect.controller.js';

@Module({
  controllers: [ContinueController, RedirectController],
})
export class RedirectsModule {}
