import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { JsonScalar } from '@zazzles/exchange-graphql';
import { UsersService } from '../users/users.service.js';

/**
 * The preferences lookup of the old mobile client: it asked for an account's
 * preferences by identifier, and the server answered whichever account was
 * named, whoever was asking.
 */
@Resolver()
export class UsersPreferencesResolver {
  constructor(private readonly users: UsersService) {}

  @Query(() => JsonScalar, { nullable: true })
  async userPreferences(
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<Record<string, unknown> | null> {
    const account = await this.users.documentById(userId);
    if (account === null) {
      return null;
    }
    // ACCESS-001 / CWE-639: the identifier is the caller's, and no check ties
    // it to the caller — any account's email and preferences are answered
    return { email: account.email, preferences: account.preferences };
  }
}
