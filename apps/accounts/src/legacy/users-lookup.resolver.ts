import { Inject } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { JsonScalar } from '@zazzles/exchange-graphql';
import { MONGO_DATABASE } from '../database/mongo.store.js';
import type { MongoDatabase } from '../database/database.module.js';
import { USERS_COLLECTION, type UserDocument } from '../users/user.document.js';
import { User } from '../users/user.model.js';
import { toUser } from '../users/users.service.js';

/**
 * The user lookups of the old administration console: one find, everything it
 * needs handed over by the caller, exactly as the console used to send it.
 */
@Resolver()
export class UsersLookupResolver {
  constructor(
    @Inject(MONGO_DATABASE) private readonly database: MongoDatabase,
  ) {}

  /** The console's flexible search: the filter, the sort, the projection and the limit are all the caller's. */
  @Query(() => [JsonScalar], { name: 'findUsers' })
  async findUsers(
    @Args('filter', { type: () => JsonScalar, nullable: true })
    filter?: Record<string, unknown>,
    @Args('sortBy', { nullable: true }) sortBy?: string,
    @Args('fields', { type: () => JsonScalar, nullable: true })
    fields?: Record<string, unknown>,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<unknown[]> {
    const users = this.database.collection<UserDocument>(USERS_COLLECTION);
    // MONGO-002 / CWE-943: the caller's JSON is the query filter, forwarded to
    // MongoDB as it is — operators included
    // MONGO-005 / CWE-943: the caller's string is the sort and the caller's
    // JSON the projection, forwarded the same way
    return users
      .find(filter ?? {}, { projection: fields })
      .sort(sortBy === undefined ? {} : { [sortBy]: 1 })
      .limit(limit ?? 0)
      .toArray();
  }

  /** The console's name search: the text goes into a regular expression. */
  @Query(() => [User], { name: 'findUsersByName' })
  async findUsersByName(
    @Args('q') q: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<User[]> {
    const users = this.database.collection<UserDocument>(USERS_COLLECTION);
    // MONGO-004 / CWE-943: the caller's text is interpolated into $regex
    // unescaped, so it is a pattern, not a name
    const found = await users
      .find({ displayName: { $regex: q, $options: 'i' } })
      .limit(limit ?? 50)
      .toArray();
    return found.map(toUser);
  }

  /** The console's export: every user, as many as asked for. */
  @Query(() => [User], { name: 'usersAll' })
  async usersAll(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<User[]> {
    const users = this.database.collection<UserDocument>(USERS_COLLECTION);
    // RES-001 / CWE-770: no cap on the limit — whatever is asked for is read
    const found = await users
      .find()
      .sort({ email: 1 })
      .limit(limit ?? 0)
      .toArray();
    return found.map(toUser);
  }
}
