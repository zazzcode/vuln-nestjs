import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Roles } from '@zazzles/exchange-internal-auth';
import { PriceInput } from './alert.inputs.js';
import { AlertEvaluationService } from './alert-evaluation.service.js';
import { Delivery, toDelivery } from '../webhooks/delivery.model.js';
import type { DeliveryEntity } from '../webhooks/delivery.entity.js';

/**
 * Evaluates every enabled alert against the prices a caller brought. The
 * client ticks the prices on `trading` and brings them here; this service
 * knows nothing about the other one.
 */
@Resolver()
export class EvaluateAlertsResolver {
  constructor(private readonly evaluation: AlertEvaluationService) {}

  /** An administrator's operation: it delivers for every user at once. */
  @Roles('ADMIN')
  @Mutation(() => [Delivery], { name: 'evaluateAlerts' })
  async evaluate(
    @Args('prices', { type: () => [PriceInput] }) prices: PriceInput[],
  ): Promise<Delivery[]> {
    const records = await this.evaluation.evaluate(prices);
    return records.map((record: DeliveryEntity) => toDelivery(record));
  }
}
