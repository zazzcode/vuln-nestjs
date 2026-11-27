import { Body, Controller, Patch } from '@nestjs/common';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { UsersService, toUser } from '../users/users.service.js';

/**
 * The profile editor of the old web client: it sent the fields it had changed,
 * and the server wrote the change it was handed, field for field.
 */
@Controller('internal/profile')
export class LegacyProfileController {
  constructor(private readonly users: UsersService) {}

  @Patch()
  async patch(
    @CurrentUser() caller: TokenPayload,
    @Body() changes: Record<string, unknown>,
  ) {
    // ACCESS-004 / CWE-915: the body is the change document — every property
    // it carries is written, `role` like any other
    await this.users.update(caller.sub, changes);
    const account = await this.users.documentById(caller.sub);
    return toUser(account!);
  }
}
