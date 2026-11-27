import {
  Args,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveReference,
  Resolver,
  Field,
} from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { MAX_LIMIT } from '@zazzles/exchange-graphql';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Roles } from '@zazzles/exchange-internal-auth';
import lodash from 'lodash';
import { Role, User, UserOrderBy } from './user.model.js';
import { UsersService } from './users.service.js';

/** What the search reads: two allowlisted fields, validated as an input type. */
@InputType()
export class UserSearchInput {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Field({ nullable: true })
  q?: string;

  @IsOptional()
  @IsEnum(Role)
  @Field(() => Role, { nullable: true })
  role?: Role;
}

/** What an administrator creates an account with. Typed fields only, and `role` has a default. */
@InputType()
export class CreateUserInput {
  @IsEmail()
  @Field()
  email!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_ ]{1,80}$/, {
    message: 'A display name is 1 to 80 letters, digits, underscores or spaces',
  })
  @Field()
  displayName!: string;

  @IsString()
  @MinLength(8)
  @Field()
  password!: string;

  @IsOptional()
  @IsEnum(Role)
  @Field(() => Role, { nullable: true })
  role?: Role;
}

/** Counts by role, for the administration page. */
@ObjectType()
export class UserStats {
  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  admins!: number;

  @Field(() => Int)
  users!: number;
}

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

  /**
   * A page of users. Typed arguments only: the filter is built field by field
   * in the repository, `q` becomes an escaped, anchored match, `orderBy` an
   * enum mapped to a field, and `limit` above the cap is refused.
   */
  @Roles('ADMIN')
  @Query(() => [User], { name: 'users' })
  listUsers(
    @Args('role', { type: () => Role, nullable: true }) role?: Role,
    @Args('q', { nullable: true }) q?: string,
    @Args('orderBy', { type: () => UserOrderBy, nullable: true })
    orderBy?: UserOrderBy,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<User[]> {
    checkedLimit(limit);
    return this.users.page({
      role,
      q: q === undefined ? undefined : lodash.trimEnd(q),
      orderBy,
      limit,
      offset,
    });
  }

  /** A text search through a DTO of two allowlisted fields: no regular expression, a fixed sort, a capped limit. */
  @Roles('ADMIN')
  @Query(() => [User], { name: 'searchUsers' })
  search(
    @Args('query') query: UserSearchInput,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<User[]> {
    checkedLimit(limit);
    return this.users.search(query.q ?? '', {
      role: query.role,
      limit,
      offset,
    });
  }

  /** Counts by role. */
  @Roles('ADMIN')
  @Query(() => UserStats, { name: 'userStats' })
  stats(): Promise<UserStats> {
    return this.users.stats();
  }

  /** Creates an account: scrypt with a fresh salt, through a typed input. An administrator's operation. */
  @Roles('ADMIN')
  @Mutation(() => User)
  createUser(@Args('input') input: CreateUserInput): Promise<User> {
    return this.users.create(input);
  }
}

/** A limit above the cap is refused, not clamped: the caller learns the page has a ceiling. */
function checkedLimit(limit: number | undefined): void {
  if (limit !== undefined && (limit < 1 || limit > MAX_LIMIT)) {
    throw new BadRequestException(`A page asks for at most ${MAX_LIMIT} users`);
  }
}
