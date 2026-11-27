import { Controller, Get, Headers, Injectable } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import { UsersService, toUser } from '../users/users.service.js';

/**
 * The "me" of the old gateway: the gateway named the caller in a header after
 * its own check, and the route answered the account that header named.
 */
@Injectable()
@Public()
@Controller('internal')
export class LegacyMeController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@Headers('x-user-id') userId: string) {
    // ACCESS-005 / CWE-807: the header is the whole proof of identity — a
    // local caller sets it and is whoever it says
    const account = await this.users.documentById(userId);
    return account === null ? null : toUser(account);
  }
}
