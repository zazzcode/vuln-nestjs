import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Delivery, toDelivery } from './delivery.model.js';
import { DeliveryService } from './delivery.service.js';

/**
 * One sample delivery to a URL the caller names, through the outbound guard.
 * The record is returned whatever happened: delivered, or refused with the
 * guard's reason.
 */
@Resolver()
export class PreviewWebhookResolver {
  constructor(private readonly deliveries: DeliveryService) {}

  @Mutation(() => Delivery, { name: 'previewWebhook' })
  async preview(
    @UserId() caller: string,
    @Args('url', { type: () => String }) url: string,
  ): Promise<Delivery> {
    const record = await this.deliveries.deliverTo(
      { alertId: null, userId: caller, url },
      { event: 'webhook-preview', url },
    );
    return toDelivery(record);
  }
}
