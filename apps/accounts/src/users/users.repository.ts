import { Inject, Injectable } from '@nestjs/common';
import { Collection } from 'mongodb';
import type { MongoDatabase } from '../database/database.module.js';
import { MONGO_DATABASE } from '../database/mongo.store.js';
import { USERS_COLLECTION, type UserDocument } from './user.document.js';

/**
 * The `users` collection. The only place in this service that writes a filter,
 * a sort or an update for it.
 */
@Injectable()
export class UsersRepository {
  private readonly users: Collection<UserDocument>;

  constructor(@Inject(MONGO_DATABASE) database: MongoDatabase) {
    this.users = database.collection<UserDocument>(USERS_COLLECTION);
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.users.findOne({ _id: id });
  }

  /** Every user, by email. */
  findAll(): Promise<UserDocument[]> {
    return this.users.find().sort({ email: 1 }).toArray();
  }

  /** Empties the collection and recreates it with its indexes. What every start and every reset does. */
  async recreate(): Promise<void> {
    await this.users.drop().catch((error: unknown) => {
      // Dropping a collection that does not exist yet is the first start, not a failure.
      if ((error as { codeName?: string }).codeName !== 'NamespaceNotFound') {
        throw error;
      }
    });
    await this.users.createIndex({ email: 1 }, { unique: true });
  }

  insert(users: UserDocument[]): Promise<void> {
    return users.length === 0
      ? Promise.resolve()
      : this.users.insertMany(users).then(() => undefined);
  }
}
