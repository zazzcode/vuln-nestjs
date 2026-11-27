import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Alert } from './alert.model.js';
import { AlertsService } from './alerts.service.js';
import { requireOwnUser } from './require-own-user.js';
import { User } from './user.model.js';

/** The alerts of the `User` entity this service extends: the caller's own, or any user for an administrator. */
@Resolver(() => User)
export class UserAlertsResolver {
  constructor(private readonly alerts: AlertsService) {}

  @ResolveField(() => [Alert])
  alerts(
    @Parent() user: User,
    @CurrentUser() caller: TokenPayload | undefined,
  ): Promise<Alert[]> {
    requireOwnUser(caller, user.id);
    return this.alerts.of(user.id);
  }
}
