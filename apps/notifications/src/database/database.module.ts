import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementEntity } from '../announcements/announcement.entity.js';
import { SqliteStore } from './sqlite.store.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqljs',
      entities: [AnnouncementEntity],
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
