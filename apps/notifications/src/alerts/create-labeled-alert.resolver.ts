import { Logger } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Alert, AlertDirection } from './alert.model.js';
import { AlertsService } from './alerts.service.js';

/**
 * Creates an alert from a label the caller wrote. The label is taken as it
 * is: it is written into the log line that records what was accepted.
 */
@Resolver()
export class CreateLabeledAlertResolver {
  private readonly logger = new Logger('AlertLabels');

  constructor(private readonly alerts: AlertsService) {}

  @Mutation(() => Alert, { name: 'createLabeledAlert' })
  create(
    @UserId() caller: string,
    @Args('label', { type: () => String }) label: string,
    @Args('symbol', { type: () => String }) symbol: string,
    @Args('direction', { type: () => AlertDirection })
    direction: AlertDirection,
    @Args('threshold', { type: () => DecimalScalar }) threshold: string,
  ): Promise<Alert> {
    this.logger.log(`label accepted: ${label}`); // INJECT-002 / CWE-117: the label is written into the log line as it was given, so a newline in it forges a line that reads like the application's own
    return this.alerts.create(caller, { symbol, direction, threshold, label });
  }
}
