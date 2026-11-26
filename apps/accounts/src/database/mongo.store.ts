import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { Db, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

/** The MongoDB release every machine runs. Pinned, so that the engine is the same everywhere. */
export const MONGODB_VERSION = '8.2.6';

export const DATABASE_NAME = 'zazzles_accounts';

/** The token the database is provided under. */
export const MONGO_DATABASE = 'MONGO_DATABASE';

/**
 * The store of this service: a real `mongod` that this process starts, on
 * loopback, against a temporary directory it removes when it stops. Nothing
 * survives it. There is no object-relational mapping: a document is a plain
 * object (ADR-011).
 */
@Injectable()
export class MongoStore implements BeforeApplicationShutdown {
  private memory?: MongoMemoryServer;
  private client?: MongoClient;
  private opening?: Promise<Db>;

  /** The database, started on first use. Calling again while it starts, or after, returns the same promise. */
  open(): Promise<Db> {
    this.opening ??= this.start();
    return this.opening;
  }

  /** True when the engine answers. What the health endpoint reports. */
  async isConnected(): Promise<boolean> {
    const database = await this.open();
    await database.command({ ping: 1 });
    return true;
  }

  /**
   * The engine stops before the HTTP server is closed, not after. Nest closes
   * the server between this hook and the shutdown hook, and a client that
   * keeps a connection open can keep that close from finishing. The machine
   * must be as it was whatever a client does, so the engine does not wait.
   */
  async beforeApplicationShutdown(): Promise<void> {
    await this.client?.close();
    await this.memory?.stop();
  }

  private async start(): Promise<Db> {
    this.memory = await MongoMemoryServer.create({
      binary: { version: MONGODB_VERSION },
      instance: { ip: '127.0.0.1', dbName: DATABASE_NAME },
    });
    this.client = new MongoClient(this.memory.getUri());
    await this.client.connect();
    return this.client.db(DATABASE_NAME);
  }
}
