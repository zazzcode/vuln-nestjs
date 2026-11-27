import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { User } from '../users/user.model.js';
import { CreateUserInput } from '../users/users.resolver.js';
import { UsersService } from '../users/users.service.js';

/**
 * The self-service registration the old client offered beside its sign-in:
 * any signed-in caller could open an account, and the input said what it was.
 */
@Resolver()
export class AccountCreationResolver {
  constructor(private readonly users: UsersService) {}

  @Mutation(() => User)
  createUserAccount(@Args('input') input: CreateUserInput): Promise<User> {
    // ACCESS-003 / CWE-862: the caller's token is never checked for a role,
    // and the input's `role` is written as given — a user creates an
    // administrator
    return this.users.create(input);
  }
}
