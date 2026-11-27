import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { RuleInput } from './alert.inputs.js';
import { Alert } from './alert.model.js';
import { AlertsService } from './alerts.service.js';

/**
 * Creates an alert from a rule: the same comparison as `createAlert`, from
 * an input with no free-text field at all.
 */
@Resolver()
export class CreateRuleAlertResolver {
  constructor(private readonly alerts: AlertsService) {}

  @Mutation(() => Alert, { name: 'createRuleAlert' })
  create(
    @UserId() caller: string,
    @Args('rule', { type: () => RuleInput }) rule: RuleInput,
  ): Promise<Alert> {
    return this.alerts.create(caller, {
      symbol: rule.symbol,
      direction: rule.direction,
      threshold: rule.threshold,
      label: null,
    });
  }
}
