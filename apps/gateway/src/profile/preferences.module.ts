import { Module } from '@nestjs/common';
import { InternalModule } from '../internal/internal.module.js';
import { CookiePreferencesController } from './cookie-preferences.controller.js';
import { PreferencesController } from './preferences.controller.js';

@Module({
  imports: [InternalModule],
  controllers: [PreferencesController, CookiePreferencesController],
})
export class PreferencesModule {}
