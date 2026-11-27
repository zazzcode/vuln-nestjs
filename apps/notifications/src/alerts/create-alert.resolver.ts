import { UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { CreateAlertInput } from './alert.inputs.js';
import { Alert } from './alert.model.js';
import { AlertsService } from './alerts.service.js';
import { LabelRecordInterceptor } from './label-record.interceptor.js';

/**
 * Creates a structured alert: a market, a direction and a threshold. The
 * label is data: logged encoded, and recorded as a field of one structured
 * record by the interceptor.
 */
@Resolver()
export class CreateAlertResolver {
  constructor(private readonly alerts: AlertsService) {}

  @UseInterceptors(LabelRecordInterceptor)
  @Mutation(() => Alert, { name: 'createAlert' })
  create(
    @UserId() caller: string,
    @Args('input', { type: () => CreateAlertInput }) input: CreateAlertInput,
  ): Promise<Alert> {
    return this.alerts.create(caller, input);
  }
}
