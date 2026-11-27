import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Alert } from './alert.model.js';
import { AlertsService } from './alerts.service.js';

/** Deletes one of the caller's own alerts, and no one else's. */
@Resolver()
export class DeleteAlertResolver {
  constructor(private readonly alerts: AlertsService) {}

  @Mutation(() => Alert, { name: 'deleteAlert' })
  delete(
    @UserId() caller: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Alert> {
    return this.alerts.deleteOwn(caller, Number(id));
  }
}
