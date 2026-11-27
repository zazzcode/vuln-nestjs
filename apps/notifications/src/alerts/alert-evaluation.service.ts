import { Injectable } from '@nestjs/common';
import { AlertsRepository } from './alerts.repository.js';
import { AlertEntity } from './alert.entity.js';
import { AlertRule } from './alert-rule.js';
import { DeliveryService } from '../webhooks/delivery.service.js';
import type { DeliveryEntity } from '../webhooks/delivery.entity.js';
import { UserSettingsRepository } from '../settings/user-settings.repository.js';

/** One price of one market, as the evaluation receives it. */
export interface PriceTick {
  symbol: string;
  price: string;
}

/**
 * Evaluates the enabled alerts against the prices a caller brought, and
 * delivers to each crossed alert's owner. The comparison is the structured
 * rule: a threshold and an operator.
 */
@Injectable()
export class AlertEvaluationService {
  private readonly rule = new AlertRule();

  constructor(
    private readonly alerts: AlertsRepository,
    private readonly settings: UserSettingsRepository,
    private readonly deliveries: DeliveryService,
  ) {}

  /** The comparison on its own, for an alert and a price. */
  crossed(
    alert: Pick<AlertEntity, 'direction' | 'threshold'>,
    price: string,
  ): boolean {
    return this.rule.crossed(alert, price);
  }

  /**
   * Every enabled alert whose threshold was crossed by the price of its
   * symbol produces one delivery to the owner's webhook URL, recorded
   * whatever happened. An alert whose symbol is not in `prices`, or that is
   * disabled, produces none.
   */
  async evaluate(prices: PriceTick[]): Promise<DeliveryEntity[]> {
    const priceBySymbol = new Map(
      prices.map((tick) => [tick.symbol, tick.price]),
    );
    const records: DeliveryEntity[] = [];
    for (const alert of await this.alerts.findEnabled()) {
      const price = priceBySymbol.get(alert.symbol);
      if (price === undefined || !this.crossed(alert, price)) {
        continue;
      }
      await this.alerts.save({ id: alert.id, lastTriggeredAt: new Date() });
      const settings = await this.settings.findByUserId(alert.userId);
      if (
        settings === null ||
        !settings.webhook ||
        settings.webhookUrl === null
      ) {
        continue;
      }
      records.push(
        await this.deliveries.deliverTo(
          { alertId: alert.id, userId: alert.userId, url: settings.webhookUrl },
          {
            alert: {
              id: alert.id,
              symbol: alert.symbol,
              direction: alert.direction,
              threshold: alert.threshold,
              label: alert.label,
            },
            price,
          },
        ),
      );
    }
    return records;
  }
}
