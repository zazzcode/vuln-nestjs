import { Controller, Get } from '@nestjs/common';
import { Roles } from '@zazzles/exchange-internal-auth';
import { type User } from './user.model.js';
import { UsersService } from './users.service.js';

/** Internal REST, which the gateway calls on a client's behalf. */
@Controller('internal/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Every user, for the gateway's `/api/v1/users`. An administrator's operation. */
  @Roles('ADMIN')
  @Get()
  all(): Promise<User[]> {
    return this.users.all();
  }
}
