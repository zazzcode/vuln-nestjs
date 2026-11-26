import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { labStart } from '@zazzles/exchange-lab-data';
import { AnnouncementsRepository } from '../announcements/announcements.repository.js';

/** The fake data of this service. Nothing here is real, and nothing is random: every run loads the same rows. */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly announcements: AnnouncementsRepository,
  ) {}

  /** Loads the fake data. Every start does; so does every reset. */
  async load(): Promise<void> {
    // First the tables, because a scenario is allowed to drop one and reset has to undo that.
    await this.dataSource.synchronize();
    await this.announcements.clear();
    // SQLite keeps a generated id counting after its rows are deleted. Reset brings it back, so that
    // a record created after a reset gets the id it would have got on the first run.
    await this.dataSource
      .query('DELETE FROM sqlite_sequence')
      .catch(() => undefined);
    await this.announcements.insert([
      {
        id: 1,
        title: 'Welcome to Zazzles Exchange',
        body: 'This is a sample exchange. Every account and every coin on it is invented.',
        authorId: 'u-admin',
        createdAt: labStart,
      },
    ]);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.load();
  }
}
