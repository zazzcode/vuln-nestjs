import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Delivery, toDelivery } from './delivery.model.js';
import { DeliveryService } from './delivery.service.js';

/**
 * One delivery to a URL the caller names, as a convenience for trying a
 * webhook out before saving it.
 */
@Resolver()
export class TestWebhookResolver {
  constructor(private readonly deliveries: DeliveryService) {}

  @Mutation(() => Delivery, { name: 'testWebhook' })
  async test(
    @UserId() caller: string,
    @Args('url', { type: () => String }) url: string,
  ): Promise<Delivery> {
    // SSRF-001 / CWE-918: the caller's URL is delivered to with no outbound guard,
    // so an address inside the lab is reached from inside the machine.
    const record = await this.deliveries.deliverToUnchecked(
      { alertId: null, userId: caller, url },
      { event: 'webhook-test', url },
    );
    return toDelivery(record);
  }
}
