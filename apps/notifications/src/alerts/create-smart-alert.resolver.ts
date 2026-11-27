import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Alert } from './alert.model.js';
import { AlertsService } from './alerts.service.js';

/**
 * Creates a smart alert from an expression the caller wrote. The expression
 * is stored as it was given and run when the prices arrive.
 */
@Resolver()
export class CreateSmartAlertResolver {
  constructor(private readonly alerts: AlertsService) {}

  @Mutation(() => Alert, { name: 'createSmartAlert' })
  create(
    @UserId() caller: string,
    @Args('expression', { type: () => String }) expression: string,
  ): Promise<Alert> {
    return this.alerts.createSmart(caller, expression);
  }
}
