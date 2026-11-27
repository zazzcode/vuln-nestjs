import {
  Args,
  ID,
  Parent,
  Query,
  ResolveReference,
  Resolver,
} from '@nestjs/graphql';
import { Roles } from '@zazzles/exchange-internal-auth';
import { User } from './user.model.js';
import { UsersService } from './users.service.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly users: UsersService) {}

  /** The gateway calls this when another service returns a reference to a user. */
  @ResolveReference()
  reference(@Parent() reference: { id: string }): Promise<User | null> {
    return this.users.byId(reference.id);
  }

  /** One user. An administrator's operation: a user has `me` for their own. */
  @Roles('ADMIN')
  @Query(() => User, { nullable: true })
  user(@Args('id', { type: () => ID }) id: string): Promise<User | null> {
    return this.users.byId(id);
  }
}
