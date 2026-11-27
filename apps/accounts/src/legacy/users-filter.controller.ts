import { Controller, Get, Inject, Injectable, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Roles } from '@zazzles/exchange-internal-auth';
import { MONGO_DATABASE } from '../database/mongo.store.js';
import type { MongoDatabase } from '../database/database.module.js';
import { USERS_COLLECTION, type UserDocument } from '../users/user.document.js';

/**
 * The administration console's filter route: the query string names the fields
 * it wants, in the bracket form the console's client library sent, and what it
 * names is what the query asks MongoDB for.
 */
@Injectable()
@Roles('ADMIN')
@Controller('internal/users')
export class UsersFilterController {
  constructor(
    @Inject(MONGO_DATABASE) private readonly database: MongoDatabase,
  ) {}

  @Get('filter')
  async filter(@Req() request: FastifyRequest) {
    // MONGO-003 / CWE-943: the bracketed query string is parsed into an object
    // — `?filter[role][$ne]=USER` becomes {role: {$ne: 'USER'}} — and used as
    // the filter, operators included
    const parsed = parseBrackets(request.query as Record<string, string>);
    const filter = (parsed.filter ?? {}) as Record<string, unknown>;
    return this.database
      .collection<UserDocument>(USERS_COLLECTION)
      .find(filter)
      .sort({ email: 1 })
      .toArray();
  }
}

/** Turns `filter[role][$ne]` keys into nested objects, the way the console's client did. */
function parseBrackets(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const match = /^(\w+)((?:\[[^\]]*\])*)$/.exec(key);
    if (match === null) {
      root[key] = value;
      continue;
    }
    const segments = [match[1], ...match[2].slice(1, -1).split('][')];
    let current: Record<string, unknown> = root;
    for (const [index, segment] of segments.entries()) {
      if (index === segments.length - 1) {
        current[segment] = value;
      } else {
        current[segment] ??= {};
        current = current[segment] as Record<string, unknown>;
      }
    }
  }
  return root;
}
