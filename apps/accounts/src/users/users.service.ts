import { Injectable } from '@nestjs/common';
import type { UserDocument } from './user.document.js';
import { type User } from './user.model.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  /** One user, or nothing when there is none. */
  async byId(id: string): Promise<User | null> {
    const document = await this.repository.findById(id);
    return document === null ? null : toUser(document);
  }

  async all(): Promise<User[]> {
    return (await this.repository.findAll()).map(toUser);
  }
}

/** The stored identifier `_id` is the graph's `id`: the same fixed string. */
function toUser(document: UserDocument): User {
  return {
    id: document._id,
    email: document.email,
    displayName: document.displayName,
    role: document.role,
    createdAt: document.createdAt,
  };
}
