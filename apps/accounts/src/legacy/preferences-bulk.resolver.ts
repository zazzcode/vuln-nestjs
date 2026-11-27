import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { JsonScalar } from '@zazzles/exchange-graphql';
import { BadRequestException, Inject } from '@nestjs/common';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { MONGO_DATABASE } from '../database/mongo.store.js';
import type { MongoDatabase } from '../database/database.module.js';
import { USERS_COLLECTION, type UserDocument } from '../users/user.document.js';
import { User } from '../users/user.model.js';
import { toUser } from '../users/users.service.js';

/** The bulk preference write of the old settings importer: one document, every field it holds. */
@Resolver()
export class PreferencesBulkResolver {
  constructor(
    @Inject(MONGO_DATABASE) private readonly database: MongoDatabase,
  ) {}

  @Mutation(() => User, { name: 'updatePreferencesAll' })
  async updatePreferencesAll(
    @CurrentUser() caller: TokenPayload,
    @Args('prefs', { type: () => JsonScalar })
    prefs: Record<string, unknown>,
  ): Promise<User> {
    const users = this.database.collection<UserDocument>(USERS_COLLECTION);
    // MONGO-006 / CWE-915: the caller's document is the $set — every field it
    // carries is written, `role` and `_id` like any other
    await users.updateOne({ _id: caller.sub }, { $set: prefs });
    const updated = await users.findOne({ _id: caller.sub });
    if (updated === null) {
      throw new BadRequestException('No such account');
    }
    return toUser(updated);
  }
}
