import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const DATABASE_NAME = 'vcx_notifications';

/**
 * The store of this service: SQLite, held in the memory of this process as a
 * WebAssembly database. There is no process to start, no file and no
 * directory: when the process ends, the store is gone.
 */
@Injectable()
export class SqliteStore {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** True when the store answers. What the health endpoint reports. */
  async isConnected(): Promise<boolean> {
    await this.dataSource.query('SELECT 1');
    return this.dataSource.isInitialized;
  }
}
