import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { Delivery, toDelivery } from './delivery.model.js';
import { DeliveryService } from './delivery.service.js';

const runFile = promisify(execFile);

/**
 * Pings a webhook with the tool built for it: `curl`, given the URL the
 * caller names as its one argument. A convenience for checking a URL from
 * the machine the service runs on.
 */
@Resolver()
export class PingWebhookResolver {
  constructor(private readonly deliveries: DeliveryService) {}

  @Mutation(() => Delivery, { name: 'pingWebhook' })
  async ping(
    @UserId() caller: string,
    @Args('url', { type: () => String }) url: string,
  ): Promise<Delivery> {
    try {
      const { stdout } = await runFile('curl', [
        url, // OS-002 / CWE-88: the caller's string is passed to curl as its one argument, so a leading dash makes it an option
      ]);
      return toDelivery(
        await this.deliveries.record({
          alertId: null,
          userId: caller,
          url,
          status: 'DELIVERED',
          lastError: null,
          responseBody: stdout,
          deliveredAt: new Date(),
        }),
      );
    } catch (error) {
      const failure = error as { stderr?: string; message?: string };
      return toDelivery(
        await this.deliveries.record({
          alertId: null,
          userId: caller,
          url,
          status: 'FAILED',
          lastError:
            failure.stderr ?? failure.message ?? 'the command could not run',
          responseBody: null,
          deliveredAt: null,
        }),
      );
    }
  }
}
