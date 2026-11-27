import { Inject, Injectable } from '@nestjs/common';
import { Collection } from 'mongodb';
import type { MongoDatabase } from '../database/database.module.js';
import { MONGO_DATABASE } from '../database/mongo.store.js';
import {
  SESSIONS_COLLECTION,
  type SessionDocument,
} from './session.document.js';

/** The `sessions` collection. The only place that writes its filters and updates. */
@Injectable()
export class SessionsRepository {
  private readonly sessions: Collection<SessionDocument>;

  constructor(@Inject(MONGO_DATABASE) database: MongoDatabase) {
    this.sessions = database.collection<SessionDocument>(SESSIONS_COLLECTION);
  }

  find(sid: string): Promise<SessionDocument | null> {
    return this.sessions.findOne({ _id: sid });
  }

  ofUser(userId: string): Promise<SessionDocument[]> {
    return this.sessions.find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  insert(session: SessionDocument): Promise<void> {
    return this.sessions.insertOne(session).then(() => undefined);
  }

  revoke(sid: string, at: Date): Promise<void> {
    return this.sessions
      .updateOne({ _id: sid }, { $set: { revokedAt: at } })
      .then(() => undefined);
  }

  /** Empties the collection and recreates its index. What every start and every reset does. */
  async recreate(): Promise<void> {
    await this.sessions.drop().catch((error: unknown) => {
      if ((error as { codeName?: string }).codeName !== 'NamespaceNotFound') {
        throw error;
      }
    });
    await this.sessions.createIndex({ userId: 1 });
  }
}
