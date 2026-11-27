import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSettingsEntity } from './user-settings.entity.js';
import { UserSettingsRepository } from './user-settings.repository.js';

/** The notification settings of a user: their table, and the operations on it. */
@Module({
  imports: [TypeOrmModule.forFeature([UserSettingsEntity])],
  providers: [UserSettingsRepository],
  exports: [UserSettingsRepository, TypeOrmModule],
})
export class SettingsModule {}
