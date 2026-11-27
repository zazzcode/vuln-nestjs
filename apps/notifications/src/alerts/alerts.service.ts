import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { clampLimit } from '@zazzles/exchange-graphql';
import { AlertDirection, toAlert } from './alert.model.js';
import { AlertsRepository } from './alerts.repository.js';
import type { Alert } from './alert.model.js';

/** What an alert is created from, whichever operation created it. */
export interface NewAlert {
  symbol: string;
  direction: AlertDirection | 'ABOVE' | 'BELOW';
  threshold: string;
  label?: string | null;
}

/**
 * The alerts of the users of this service. Every operation here is the
 * caller's own: the user id comes from the caller, never from an argument.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly repository: AlertsRepository) {}

  /** One user's alerts, by id, with `limit` and `offset` clamped as everywhere in the lab. */
  async of(
    userId: string,
    limit?: number | null,
    offset = 0,
  ): Promise<Alert[]> {
    const rows = await this.repository.findByUserId(userId);
    const start = Math.max(offset, 0);
    return rows
      .slice(start, start + clampLimit(limit))
      .map((row) => toAlert(row));
  }

  /**
   * Stores a structured alert: a market, a direction and a threshold. The
   * label, when there is one, is logged as data, encoded so it cannot forge
   * a line of its own.
   */
  async create(caller: string, input: NewAlert): Promise<Alert> {
    const stored = await this.repository
      .insert([
        {
          userId: caller,
          symbol: input.symbol,
          direction: input.direction,
          threshold: input.threshold,
          label: input.label ?? null,
          enabled: true,
        },
      ])
      .then(() => this.repository.findByUserId(caller));
    const row = stored.at(-1);
    if (row === undefined) {
      throw new NotFoundException('The alert was not stored');
    }
    this.logger.log(
      `alert created: ${JSON.stringify({ label: row.label, symbol: row.symbol, threshold: row.threshold })}`,
    );
    return toAlert(row);
  }

  /**
   * Stores a smart alert: an expression the caller wrote, run when the prices
   * arrive. The structured rule it keeps beside the expression sits far from
   * every reference price, so the expression alone decides when it crosses.
   */
  async createSmart(caller: string, expression: string): Promise<Alert> {
    const stored = await this.repository
      .insert([
        {
          userId: caller,
          symbol: 'BTC-USD',
          direction: 'ABOVE',
          threshold: '999999.00',
          label: 'smart alert',
          expression,
          enabled: true,
        },
      ])
      .then(() => this.repository.findByUserId(caller));
    const row = stored.at(-1);
    if (row === undefined) {
      throw new NotFoundException('The alert was not stored');
    }
    return toAlert(row);
  }

  /**
   * Deletes one of the caller's own alerts. Another user's alert is refused,
   * an unknown one is not found.
   */
  async deleteOwn(caller: string, id: number): Promise<Alert> {
    const row = await this.repository.findById(id);
    if (row === null) {
      throw new NotFoundException(`There is no alert ${id}`);
    }
    if (row.userId !== caller) {
      throw new ForbiddenException(
        'Only the alert of the caller can be deleted',
      );
    }
    await this.repository.remove(id);
    return toAlert(row);
  }
}
