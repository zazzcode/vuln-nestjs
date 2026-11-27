import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertEntity } from '../alerts/alert.entity.js';
import { AnnouncementEntity } from '../announcements/announcement.entity.js';
import { UserSettingsEntity } from '../settings/user-settings.entity.js';
import { DeliveryEntity } from '../webhooks/delivery.entity.js';
import { SqliteStore } from './sqlite.store.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqljs',
      entities: [
        AnnouncementEntity,
        AlertEntity,
        DeliveryEntity,
        UserSettingsEntity,
      ],
      // Every store is ephemeral, so the entities are the schema. There are no migrations.
      synchronize: true,
      // In memory only: nothing is ever written to a file.
      autoSave: false,
      // Queries contain user data.
      logging: false,
    }),
  ],
  providers: [SqliteStore],
  exports: [SqliteStore],
})
export class DatabaseModule {}
