import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { createDB } from 'mysql-memory-server';

/** The MySQL release every machine runs. Pinned: the package would otherwise pick one by the machine's own version of itself. */
export const MYSQL_VERSION = '8.4.9';

export const DATABASE_NAME = 'zazzles_trading';

/** How TypeORM is told to reach the engine this store started. */
export interface MysqlConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/**
 * The store of this service: a real `mysqld` that this process starts, on
 * loopback, against a temporary directory it removes when it stops. Nothing
 * survives it. The first start on a machine downloads the binary first.
 */
@Injectable()
export class MysqlStore implements OnApplicationShutdown {
  private database?: Awaited<ReturnType<typeof createDB>>;
  private opening?: Promise<MysqlConnection>;

  /** How to reach the engine, started on first use. Calling again while it starts, or after, returns the same promise. */
  open(): Promise<MysqlConnection> {
    this.opening ??= this.start();
    return this.opening;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database?.stop();
  }

  private async start(): Promise<MysqlConnection> {
    this.database = await createDB({
      version: MYSQL_VERSION,
      dbName: DATABASE_NAME,
      // With the X plugin on, mysqld opens a second listener on every interface: the
      // package binds only the main port to loopback. The lab binds every listener to 127.0.0.1.
      xEnabled: 'OFF',
    });
    return {
      host: '127.0.0.1',
      port: this.database.port,
      username: this.database.username,
      // The engine is started with an empty password: it exists for minutes, on loopback.
      password: '',
      database: this.database.dbName,
    };
  }
}
