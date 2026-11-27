import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { labStart, labUsers } from '@zazzles/exchange-lab-data';
import { Role } from '../users/user.model.js';
import type { UserDocument } from '../users/user.document.js';
import { UsersRepository } from '../users/users.repository.js';
import { scryptWithSalt } from '../users/passwords.js';
import { defaultPreferences } from '../users/users.service.js';
import { SessionsRepository } from '../sessions/sessions.repository.js';
import { DocumentsRepository } from '../documents/documents.repository.js';
import { SEEDED_DOCUMENTS, UploadsStore } from '../documents/uploads.store.js';

/**
 * The fake data of this service. Nothing here is real, and nothing is random:
 * every run loads the same records. The password salts are derived from the
 * fixed identifiers so the hashes are identical every run too; a password
 * created or changed at runtime always takes a random salt.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly documents: DocumentsRepository,
    private readonly uploads: UploadsStore,
  ) {}

  /** Loads the fake data. Every start does; so does every reset. */
  async load(): Promise<void> {
    await this.users.recreate();
    await this.sessions.recreate();
    await this.documents.recreate();
    await this.users.insert(
      labUsers.map((user): UserDocument => {
        const salt = createHash('sha256')
          .update(`vcx-lab-${user.id}`)
          .digest('hex');
        return {
          _id: user.id,
          email: user.email,
          displayName: user.displayName,
          passwordHash: scryptWithSalt(user.password, salt),
          role: user.role as Role,
          preferences: defaultPreferences(),
          avatarUrl: null,
          createdAt: labStart,
          updatedAt: labStart,
          failedAttempts: 0,
          lockedUntil: null,
          resetCode: null,
        };
      }),
    );
    // Alice's two documents: the metadata, and the files themselves.
    for (const document of SEEDED_DOCUMENTS) {
      await this.uploads.write(
        document.storedName,
        Buffer.from(document.contents),
      );
      await this.documents.insert({
        _id: document.id,
        userId: 'u-alice',
        storedName: document.storedName,
        originalName: document.originalName,
        mimeType: document.mimeType,
        size: document.contents.length,
        createdAt: labStart,
      });
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.load();
  }
}
