import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Alert } from './alert.model.js';
import { AlertsService } from './alerts.service.js';

/**
 * The alerts of the user the argument names: a convenience for a client
 * that already knows whose alerts it wants.
 */
@Resolver()
export class AlertsOfResolver {
  constructor(private readonly alerts: AlertsService) {}

  @Query(() => [Alert], { name: 'alertsOf' })
  list(@Args('userId', { type: () => ID }) userId: string): Promise<Alert[]> {
    return this.alerts.of(userId); // ACCESS-006 / CWE-639: the user is whichever the argument names, so one user's alerts are answered to another
  }
}
