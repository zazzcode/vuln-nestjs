import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { createPool, type Pool } from 'mysql2/promise';
import { MysqlStore } from './mysql.store.js';

/**
 * The driver's own prepared statements, for the queries that want `execute()`
 * and not `query()`. Reaches the same engine the store started, with its own
 * pool, and closes it when the service stops.
 */
@Injectable()
export class SqlClient implements BeforeApplicationShutdown {
  private pool?: Promise<Pool>;

  constructor(private readonly store: MysqlStore) {}

  /**
   * A prepared statement. The text and the parameters must come from the same
   * tag: `execute()` prepares whatever text it is handed, placeholder or not.
   */
  async execute(text: string, values: readonly unknown[]): Promise<unknown[]> {
    const pool = await this.connection();
    const [rows] = await pool.execute(text, [...values]);
    return rows as unknown[];
  }

  private connection(): Promise<Pool> {
    this.pool ??= this.store.open().then((engine) =>
      createPool({
        host: engine.host,
        port: engine.port,
        user: engine.username,
        password: engine.password,
        database: engine.database,
        connectionLimit: 8,
        supportBigNumbers: true,
        bigNumberStrings: true,
        decimalNumbers: false,
      }),
    );
    return this.pool;
  }

  async beforeApplicationShutdown(): Promise<void> {
    const pool = await this.pool?.catch(() => undefined);
    await pool?.end().catch(() => undefined);
  }
}
