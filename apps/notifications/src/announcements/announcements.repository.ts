import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { AnnouncementEntity } from './announcement.entity.js';

/** The `announcements` table. The only place in this service that writes a query for it. */
@Injectable()
export class AnnouncementsRepository {
  constructor(
    @InjectRepository(AnnouncementEntity)
    private readonly rows: Repository<AnnouncementEntity>,
  ) {}

  findAll(): Promise<AnnouncementEntity[]> {
    return this.rows.find({ order: { id: 'ASC' } });
  }

  findById(id: number): Promise<AnnouncementEntity | null> {
    return this.rows.findOneBy({ id });
  }

  /** Empties the table. */
  clear(): Promise<void> {
    return this.rows.clear();
  }

  insert(announcements: DeepPartial<AnnouncementEntity>[]): Promise<void> {
    return announcements.length === 0
      ? Promise.resolve()
      : this.rows.insert(announcements).then(() => undefined);
  }

  /** Stores one row and answers it, with the id the store gave it. */
  async add(row: DeepPartial<AnnouncementEntity>): Promise<AnnouncementEntity> {
    await this.insert([row]);
    const all = await this.rows.find({ order: { id: 'DESC' }, take: 1 });
    const stored = all[0];
    if (stored === undefined) {
      throw new Error('The announcement was not stored');
    }
    return stored;
  }
}
