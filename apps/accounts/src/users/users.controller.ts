import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Roles, ServiceToken } from '@zazzles/exchange-internal-auth';
import { trimEnd } from 'lodash';
import { Role, type User } from './user.model.js';
import { UsersService, toUser } from './users.service.js';

/** What the paged list reads: flat parameters, each with a declared type. */
export class ListUsersQuery {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** What the search reads: two allowlisted fields, nothing else. */
export class SearchUsersQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Internal REST, which the gateway calls on a client's behalf. */
@Controller('internal/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * A page of users for the gateway's `/api/v1/users`. An administrator's
   * operation, asked through flat parameters: `q` is trimmed here, and the
   * repository turns it into an escaped, anchored match.
   */
  @Roles('ADMIN')
  @Get()
  list(@Query() query: ListUsersQuery): Promise<User[]> {
    return this.users.page({
      role: query.role,
      q: query.q === undefined ? undefined : trimEnd(query.q),
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** The text search for the gateway's `/api/v1/users/search`, through a DTO of two allowlisted fields. */
  @Roles('ADMIN')
  @Get('search')
  search(@Query() query: SearchUsersQuery): Promise<User[]> {
    const q = query.q ?? '';
    return this.users.search(q, {
      role: query.role,
      limit: query.limit,
    });
  }

  /** One account by email, for a call the system itself makes on another service's behalf. */
  @ServiceToken()
  @Get('lookup')
  async lookup(@Query('email') email: string): Promise<User | null> {
    const document = await this.users.byEmail(email);
    return document === null ? null : toUser(document);
  }
}
