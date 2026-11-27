import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { labStart, labUsers } from '@zazzles/exchange-lab-data';
import { AlertsRepository } from '../alerts/alerts.repository.js';
import { AnnouncementsRepository } from '../announcements/announcements.repository.js';
import { DeliveriesRepository } from '../webhooks/deliveries.repository.js';
import { UserSettingsRepository } from '../settings/user-settings.repository.js';

/** One alert per user with a wallet, each on its own market. The thresholds sit around the reference prices. */
const SEEDED_ALERTS = [
  {
    userId: 'u-alice',
    symbol: 'BTC-USD',
    direction: 'ABOVE',
    threshold: '70000.00',
    label: 'Take profit',
  },
  {
    userId: 'u-bob',
    symbol: 'ETH-USD',
    direction: 'BELOW',
    threshold: '3000.00',
    label: 'Buy the dip',
  },
  {
    userId: 'u-carol',
    symbol: 'SOL-USD',
    direction: 'ABOVE',
    threshold: '160.00',
    label: 'Momentum',
  },
  {
    userId: 'u-dave',
    symbol: 'XRP-USD',
    direction: 'BELOW',
    threshold: '0.45',
    label: 'Exit',
  },
  {
    userId: 'u-erin',
    symbol: 'DOGE-USD',
    direction: 'ABOVE',
    threshold: '0.15',
    label: 'Moon',
  },
] as const;

/** The fake data of this service. Nothing here is real, and nothing is random: every run loads the same rows. */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly announcements: AnnouncementsRepository,
    private readonly alerts: AlertsRepository,
    private readonly deliveries: DeliveriesRepository,
    private readonly settings: UserSettingsRepository,
  ) {}

  /** Loads the fake data. Every start does; so does every reset. */
  async load(): Promise<void> {
    // First the tables, because a scenario is allowed to drop one and reset has to undo that.
    await this.dataSource.synchronize();
    await Promise.all([
      this.announcements.clear(),
      this.alerts.clear(),
      this.deliveries.clear(),
      this.settings.clear(),
    ]);
    // SQLite keeps a generated id counting after its rows are deleted. Reset brings it back, so that
    // a record created after a reset gets the id it would have got on the first run.
    await this.dataSource
      .query('DELETE FROM sqlite_sequence')
      .catch(() => undefined);
    await this.announcements.insert([
      {
        id: 1,
        title: 'Welcome to VCX',
        body: 'This is a sample exchange. Every account and every coin on it is invented.',
        authorId: 'u-admin',
        createdAt: labStart,
        sentAt: null,
      },
    ]);
    await this.alerts.insert(
      SEEDED_ALERTS.map((alert) => ({ ...alert, createdAt: labStart })),
    );
    // The users with a wallet are the ones a delivery can reach: their webhook points at the loopback test receiver.
    await this.settings.insert(
      labUsers
        .filter((user) => user.startingUsdCents !== null)
        .map((user) => ({
          userId: user.id,
          webhookUrl: `http://127.0.0.1:4010/webhook/${user.id.replace('u-', '')}`,
          email: true,
          sms: true,
          webhook: true,
        })),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.load();
  }
}
