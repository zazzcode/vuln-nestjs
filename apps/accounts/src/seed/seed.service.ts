import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { labStart, labUsers } from '@zazzles/exchange-lab-data';
import { Role } from '../users/user.model.js';
import type { UserDocument } from '../users/user.document.js';
import { UsersRepository } from '../users/users.repository.js';

/** The fake data of this service. Nothing here is real, and nothing is random: every run loads the same records. */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(private readonly users: UsersRepository) {}

  /** Loads the fake data. Every start does; so does every reset. */
  async load(): Promise<void> {
    await this.users.recreate();
    await this.users.insert(
      labUsers.map((user): UserDocument => ({
        _id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role as Role,
        createdAt: labStart,
      })),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.load();
  }
}
