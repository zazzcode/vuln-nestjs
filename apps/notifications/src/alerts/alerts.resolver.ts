import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Alert } from './alert.model.js';
import { AlertsService } from './alerts.service.js';

/** The caller's alerts. There is no argument that could name another user. */
@Resolver()
export class AlertsResolver {
  constructor(private readonly alerts: AlertsService) {}

  @Query(() => [Alert], { name: 'alerts' })
  list(
    @UserId() caller: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<Alert[]> {
    return this.alerts.of(caller, limit, offset);
  }
}
