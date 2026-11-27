import { Inject, Injectable } from '@nestjs/common';
import { Collection } from 'mongodb';
import type { MongoDatabase } from '../database/database.module.js';
import { MONGO_DATABASE } from '../database/mongo.store.js';
import {
  DOCUMENTS_COLLECTION,
  type DocumentRecord,
} from './document.record.js';

/** The `documents` collection. The only place that writes its filters. */
@Injectable()
export class DocumentsRepository {
  private readonly documents: Collection<DocumentRecord>;

  constructor(@Inject(MONGO_DATABASE) database: MongoDatabase) {
    this.documents = database.collection<DocumentRecord>(DOCUMENTS_COLLECTION);
  }

  find(id: string): Promise<DocumentRecord | null> {
    return this.documents.findOne({ _id: id });
  }

  ofUser(userId: string): Promise<DocumentRecord[]> {
    return this.documents.find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  byOriginalName(
    userId: string,
    originalName: string,
  ): Promise<DocumentRecord | null> {
    return this.documents.findOne({ userId, originalName });
  }

  insert(record: DocumentRecord): Promise<void> {
    return this.documents.insertOne(record).then(() => undefined);
  }

  /** Empties the collection and recreates its index. What every start and every reset does. */
  async recreate(): Promise<void> {
    await this.documents.drop().catch((error: unknown) => {
      if ((error as { codeName?: string }).codeName !== 'NamespaceNotFound') {
        throw error;
      }
    });
    await this.documents.createIndex({ userId: 1 });
  }
}
