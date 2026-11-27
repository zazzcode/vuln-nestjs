import { BadRequestException, Injectable } from '@nestjs/common';
import type { Preferences, UserDocument } from './user.document.js';
import { Role, type User, UserOrderBy } from './user.model.js';
import { UsersRepository } from './users.repository.js';
import { scryptHash } from './passwords.js';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  /** One user, or nothing when there is none. */
  async byId(id: string): Promise<User | null> {
    const document = await this.repository.findById(id);
    return document === null ? null : toUser(document);
  }

  async byEmail(email: string): Promise<UserDocument | null> {
    return this.repository.findByEmail(email);
  }

  /** A page of users, the filter built by the repository from typed fields. */
  async page(options: {
    role?: Role;
    q?: string;
    orderBy?: UserOrderBy;
    limit?: number;
    offset?: number;
  }): Promise<User[]> {
    const page = await this.repository.page(options);
    return page.users.map(toUser);
  }

  /** A text search: no regular expression touches the caller's text. */
  search(
    q: string,
    options: { role?: Role; limit?: number; offset?: number } = {},
  ): Promise<User[]> {
    return this.repository
      .textSearch(q, options)
      .then((users) => users.map(toUser));
  }

  stats(): Promise<{ total: number; admins: number; users: number }> {
    return this.repository.countByRole();
  }

  /** Creates an account with a scrypt hash and a fresh salt. A duplicate email is refused. */
  async create(input: {
    email: string;
    displayName: string;
    password: string;
    role?: Role;
  }): Promise<User> {
    if ((await this.repository.findByEmail(input.email)) !== null) {
      throw new BadRequestException('That email is already registered');
    }
    const document: UserDocument = {
      _id: `u-${crypto.randomUUID()}`,
      email: input.email,
      displayName: input.displayName,
      passwordHash: scryptHash(input.password),
      role: input.role ?? Role.USER,
      preferences: defaultPreferences(),
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      failedAttempts: 0,
      lockedUntil: null,
      resetCode: null,
    };
    await this.repository.insert([document]);
    return toUser(document);
  }

  async all(): Promise<User[]> {
    return (await this.repository.findAll()).map(toUser);
  }

  /** One user's stored document, for the operations that read more than the graph's `User` shows. */
  documentById(id: string): Promise<UserDocument | null> {
    return this.repository.findById(id);
  }

  /** Applies a change the caller's operation has already allowlisted, field by field. */
  async update(id: string, changes: Record<string, unknown>): Promise<void> {
    await this.repository.update(id, changes);
  }

  /** Stores a document an operation of this service has already built. */
  async createWithDocument(document: UserDocument): Promise<void> {
    await this.repository.insert([document]);
  }

  /** The legacy sign-in's match: the filter as the legacy route built it. */
  findOneWhere(filter: Record<string, unknown>): Promise<UserDocument | null> {
    return this.repository.findOneWhere(filter);
  }
}

export function defaultPreferences(): Preferences {
  return {
    theme: 'dark',
    language: 'en',
    currency: 'USD',
    marketingEmails: 'false',
  };
}

/** The stored identifier `_id` is the graph's `id`: the same fixed string. */
export function toUser(document: UserDocument): User {
  return {
    id: document._id,
    email: document.email,
    displayName: document.displayName,
    role: document.role,
    preferences: document.preferences,
    avatarUrl: document.avatarUrl,
    createdAt: document.createdAt,
  };
}
