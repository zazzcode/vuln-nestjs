import { Injectable } from '@nestjs/common';
import { DeliveriesRepository } from './deliveries.repository.js';
import { DeliveryEntity } from './delivery.entity.js';
import type { OutcomeFields } from './webhook-client.service.js';
import { WebhookClientService } from './webhook-client.service.js';
import type { UserSettingsEntity } from '../settings/user-settings.entity.js';
import { UserSettingsRepository } from '../settings/user-settings.repository.js';

/** What a delivery record is made of, beyond who it was for and where it went. */
export type DeliveryAttempt = {
  alertId: number | null;
  userId: string;
  url: string;
} & OutcomeFields;

/**
 * The delivery record. One attempt is recorded whatever happened: delivered,
 * refused by the guard, or unreachable. There are no retries, so `attempts`
 * is always 1.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly deliveries: DeliveriesRepository,
    private readonly settings: UserSettingsRepository,
    private readonly client: WebhookClientService,
  ) {}

  /** Records one attempt, whatever happened. */
  record(attempt: DeliveryAttempt): Promise<DeliveryEntity> {
    return this.deliveries
      .insert([
        {
          alertId: attempt.alertId,
          userId: attempt.userId,
          url: attempt.url,
          status: attempt.status,
          attempts: 1,
          lastError: attempt.lastError,
          responseBody: attempt.responseBody,
          deliveredAt: attempt.deliveredAt,
        },
      ])
      .then((rows) => rows[0]!);
  }

  /** What one guarded POST to a URL ended as, recorded for one user. */
  async deliverTo(
    input: { alertId: number | null; userId: string; url: string },
    payload: unknown,
  ): Promise<DeliveryEntity> {
    const attempt = await this.client.post(input.url, payload);
    return this.record({
      ...input,
      ...WebhookClientService.outcomeOf(attempt),
    });
  }

  /**
   * Sends to every user whose webhook channel is on and who has a URL: one
   * record per recipient, whatever each attempt ended as.
   */
  async toRecipients(
    send: (
      settings: UserSettingsEntity,
      url: string,
    ) => Promise<OutcomeFields & { url: string }>,
  ): Promise<DeliveryEntity[]> {
    const records: DeliveryEntity[] = [];
    for (const settings of await this.settings.findAll()) {
      if (!settings.webhook || settings.webhookUrl === null) {
        continue;
      }
      const outcome = await send(settings, settings.webhookUrl);
      records.push(
        await this.record({
          alertId: null,
          userId: settings.userId,
          url: outcome.url,
          status: outcome.status,
          lastError: outcome.lastError,
          responseBody: outcome.responseBody,
          deliveredAt: outcome.deliveredAt,
        }),
      );
    }
    return records;
  }
}
