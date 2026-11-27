import { Inject, Injectable } from '@nestjs/common';
import { Collection } from 'mongodb';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  clampLimit,
} from '@zazzles/exchange-graphql';
import type { MongoDatabase } from '../database/database.module.js';
import { MONGO_DATABASE } from '../database/mongo.store.js';
import {
  USERS_COLLECTION,
  type Preferences,
  type UserDocument,
} from './user.document.js';
import { Role, UserOrderBy } from './user.model.js';

/** The sort each `UserOrderBy` value maps to. An enum decides the field, never the caller. */
const SORT_BY_ORDER: Record<UserOrderBy, Record<string, 1 | -1>> = {
  NEWEST: { createdAt: -1 },
  OLDEST: { createdAt: 1 },
  EMAIL: { email: 1 },
  DISPLAY_NAME: { displayName: 1 },
};

/** A page of users, as the paged queries answer it. */
export interface UserPage {
  users: UserDocument[];
  limit: number;
  offset: number;
}

/** How a user's text is turned into a match on the display name: escaped, anchored, insensitive. */
function anchoredPattern(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * The `users` collection. The only place in this service that writes a filter,
 * a sort or an update for it, always from typed, allowlisted fields.
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

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email });
  }

  /** Every user, by email. */
  findAll(): Promise<UserDocument[]> {
    return this.users.find().sort({ email: 1 }).toArray();
  }

  /**
   * A page, the filter built field by field: a role as an equality on the enum,
   * text as an escaped, anchored match on the display name.
   */
  page(options: {
    role?: Role;
    q?: string;
    orderBy?: UserOrderBy;
    limit?: number;
    offset?: number;
  }): Promise<UserPage> {
    const filter: Record<string, unknown> = {};
    if (options.role !== undefined) {
      filter.role = options.role;
    }
    if (options.q !== undefined) {
      filter.displayName = anchoredPattern(options.q);
    }
    const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
    return this.users
      .find(filter)
      .sort(SORT_BY_ORDER[options.orderBy ?? UserOrderBy.EMAIL])
      .skip(Math.max(options.offset ?? 0, 0))
      .limit(limit)
      .toArray()
      .then((users) => ({ users, limit, offset: options.offset ?? 0 }));
  }

  /**
   * A text search over the display name's text index: no regular expression
   * touches the caller's text, and the sort is fixed.
   */
  textSearch(
    q: string,
    options: { role?: Role; limit?: number; offset?: number } = {},
  ): Promise<UserDocument[]> {
    const filter: Record<string, unknown> = {
      $text: { $search: q },
    };
    if (options.role !== undefined) {
      filter.role = options.role;
    }
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    return this.users
      .find(filter)
      .sort({ email: 1 })
      .skip(Math.max(options.offset ?? 0, 0))
      .limit(limit)
      .toArray();
  }

  countByRole(): Promise<{ total: number; admins: number; users: number }> {
    return Promise.all([
      this.users.countDocuments(),
      this.users.countDocuments({ role: Role.ADMIN }),
      this.users.countDocuments({ role: Role.USER }),
    ]).then(([total, admins, users]) => ({ total, admins, users }));
  }

  update(id: string, changes: Record<string, unknown>): Promise<void> {
    return this.users
      .updateOne({ _id: id }, { $set: { ...changes, updatedAt: new Date() } })
      .then(() => undefined);
  }

  insert(users: UserDocument[]): Promise<void> {
    return users.length === 0
      ? Promise.resolve()
      : this.users.insertMany(users).then(() => undefined);
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
    // What the text search reads: the display name only.
    await this.users.createIndex({ displayName: 'text' });
  }
}

/** The names a preference may be written under, the one allowlist the typed paths use. */
export const PREFERENCE_KEYS: readonly (keyof Preferences)[] = [
  'theme',
  'language',
  'currency',
  'marketingEmails',
];
