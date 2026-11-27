import { Module } from '@nestjs/common';
import { InternalModule } from '../internal/internal.module.js';
import { PreferencesController } from './preferences.controller.js';

@Module({
  imports: [InternalModule],
  controllers: [PreferencesController],
})
export class PreferencesModule {}
