import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { UserSettingsEntity } from './user-settings.entity.js';

/** The `user_settings` table. The only place in this service that writes a query for it. */
@Injectable()
export class UserSettingsRepository {
  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly rows: Repository<UserSettingsEntity>,
  ) {}

  findByUserId(userId: string): Promise<UserSettingsEntity | null> {
    return this.rows.findOneBy({ userId });
  }

  findAll(): Promise<UserSettingsEntity[]> {
    return this.rows.find({ order: { id: 'ASC' } });
  }

  insert(settings: DeepPartial<UserSettingsEntity>[]): Promise<void> {
    return settings.length === 0
      ? Promise.resolve()
      : this.rows.insert(settings).then(() => undefined);
  }

  /** Creates the row when the user has none. */
  async save(settings: UserSettingsEntity): Promise<UserSettingsEntity> {
    return this.rows.save(settings);
  }

  /** Empties the table. */
  clear(): Promise<void> {
    return this.rows.clear();
  }
}
