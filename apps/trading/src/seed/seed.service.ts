import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { labMarkets, labStart, labUsers } from '@zazzles/exchange-lab-data';
import { DataSource, type DeepPartial } from 'typeorm';
import {
  COIN_SCALE,
  DOLLAR_SCALE,
  everyAsset,
  toDecimal,
  toMinorUnits,
} from '../money/money.js';
import { MarketEntity } from '../markets/market.entity.js';
import { PriceTickEntity } from '../markets/price-tick.entity.js';
import {
  OrderEntity,
  OrderSide,
  OrderStatus,
  OrderType,
} from '../orders/order.entity.js';
import { ReportsService } from '../reports/reports.service.js';
import { ReportEntity } from '../reports/report.entity.js';
import { TradeEntity } from '../trades/trade.entity.js';
import {
  LedgerEntryEntity,
  LedgerKind,
} from '../wallets/ledger-entry.entity.js';
import { WalletEntity } from '../wallets/wallet.entity.js';

const minutesAfter = (minutes: number): Date =>
  new Date(labStart.getTime() + minutes * 60_000);

/** A decimal string as whole cents, which every seeded price is. */
const cents = (amount: string): string => {
  const minor = toMinorUnits(amount, DOLLAR_SCALE);
  if (minor === null) {
    throw new Error(`The seed price ${amount} is not a whole number of cents`);
  }
  return minor;
};

/**
 * The fake data of this service. Nothing here is real, and nothing is random:
 * every run loads the same rows, with the same identifiers.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly reports: ReportsService,
  ) {}

  /** Loads the fake data. Every start does; so does every reset. */
  async load(): Promise<void> {
    // First the tables, because a scenario is allowed to drop one and reset has to undo that.
    await this.dataSource.synchronize();
    for (const entity of [
      TradeEntity,
      PriceTickEntity,
      LedgerEntryEntity,
      WalletEntity,
      ReportEntity,
      MarketEntity,
      OrderEntity,
    ]) {
      await this.dataSource.getRepository(entity).clear();
    }
    await this.seedMarkets();
    await this.seedWallets();
    await this.seedOrders();
    await this.seedTrades();
    await this.seedReports();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.load();
  }

  /** Five markets, each with the reference price the lab's shared data starts it at. */
  private async seedMarkets(): Promise<void> {
    await this.dataSource.getRepository(MarketEntity).insert(
      labMarkets.map((market) => ({
        symbol: market.symbol,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        referencePrice: cents(market.referencePrice),
        tickedAt: labStart,
      })),
    );
  }

  /** Five users with a wallet for every asset: the starting dollars, and nothing of any coin. */
  private async seedWallets(): Promise<void> {
    const walletRows: DeepPartial<WalletEntity>[] = [];
    const ledgerRows: DeepPartial<LedgerEntryEntity>[] = [];
    for (const user of labUsers) {
      if (user.startingUsdCents === null) {
        continue;
      }
      for (const asset of everyAsset) {
        walletRows.push({
          userId: user.id,
          asset,
          balance: asset === 'USD' ? String(user.startingUsdCents) : '0',
        });
      }
      // The starting dollars have a ledger entry, so a balance is always the sum of its entries.
      ledgerRows.push({
        userId: user.id,
        asset: 'USD',
        amount: String(user.startingUsdCents),
        kind: LedgerKind.DEPOSIT,
        reference: 'seed',
        createdAt: labStart,
      });
    }
    await this.dataSource.getRepository(WalletEntity).insert(walletRows);
    await this.dataSource.getRepository(LedgerEntryEntity).insert(ledgerRows);
  }

  /** Two resting limit orders per market, from different users. */
  private async seedOrders(): Promise<void> {
    await this.dataSource.getRepository(OrderEntity).insert(openOrders());
    // The reference is `ord-`, then the id: written once the rows have ids.
    await this.dataSource.query(
      `UPDATE orders SET reference = CONCAT('ord-', id)`,
    );
  }

  /** Three trades per market, against the resting orders. */
  private async seedTrades(): Promise<void> {
    await this.dataSource.getRepository(TradeEntity).insert(seedTrades());
  }

  /** One statement per user, as a file under the run's reports directory and a row that names it. */
  private async seedReports(): Promise<void> {
    await this.reports.clearFiles();
    for (const user of labUsers) {
      if (user.startingUsdCents === null) {
        continue;
      }
      const wallets = await this.dataSource
        .getRepository(WalletEntity)
        .find({ where: { userId: user.id }, order: { asset: 'ASC' } });
      const storedName = `statement-${user.id}.csv`;
      const contents = [
        'statement',
        'asset,balance',
        ...wallets.map(
          (wallet) =>
            `${wallet.asset},${toDecimal(wallet.balance, wallet.asset === 'USD' ? DOLLAR_SCALE : COIN_SCALE)}`,
        ),
      ].join('\n');
      await this.reports.write(storedName, `${contents}\n`);
      await this.dataSource.getRepository(ReportEntity).insert({
        userId: user.id,
        kind: 'statement',
        storedName,
        createdAt: labStart,
      });
    }
  }
}

/** The resting limit orders of the fake data, in insert order: the ids they get are 1 to 10. */
export function openOrders(): DeepPartial<OrderEntity>[] {
  return [
    // Alice offers to buy half a bitcoin for 64,000 dollars. The memo is a formula: see INJECT-001.
    {
      userId: 'u-alice',
      symbol: 'BTC-USD',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      limitPrice: '6400000',
      quantity: '50000000',
      memo: '=zazzles-lab-marker',
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-bob',
      symbol: 'BTC-USD',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      limitPrice: '6600000',
      quantity: '20000000',
      memo: 'stop loss above entry',
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-carol',
      symbol: 'ETH-USD',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      limitPrice: '310000',
      quantity: '100000000',
      memo: null,
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-dave',
      symbol: 'ETH-USD',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      limitPrice: '330000',
      quantity: '200000000',
      memo: null,
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-erin',
      symbol: 'SOL-USD',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      limitPrice: '14000',
      quantity: '1000000000',
      memo: null,
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-alice',
      symbol: 'SOL-USD',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      limitPrice: '16000',
      quantity: '500000000',
      memo: null,
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-bob',
      symbol: 'XRP-USD',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      limitPrice: '40',
      quantity: '100000000000',
      memo: null,
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-carol',
      symbol: 'XRP-USD',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      limitPrice: '60',
      quantity: '50000000000',
      memo: null,
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-dave',
      symbol: 'DOGE-USD',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      limitPrice: '10',
      quantity: '500000000000',
      memo: null,
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
    {
      userId: 'u-erin',
      symbol: 'DOGE-USD',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      limitPrice: '15',
      quantity: '1000000000000',
      memo: null,
      status: OrderStatus.OPEN,
      createdAt: labStart,
      updatedAt: labStart,
    },
  ];
}

/** The trades of the fake data: three per market, on the resting orders. Trade 1 is the most recent. */
export function seedTrades(): DeepPartial<TradeEntity>[] {
  const trade = (
    orderId: number,
    userId: string,
    symbol: string,
    side: OrderSide,
    price: string,
    quantity: string,
    fee: string,
    minutesIn: number,
  ): DeepPartial<TradeEntity> => ({
    orderId,
    userId,
    symbol,
    side,
    price,
    quantity,
    fee,
    executedAt: minutesAfter(minutesIn),
  });

  return [
    trade(
      1,
      'u-alice',
      'BTC-USD',
      OrderSide.BUY,
      '640000',
      '10000000',
      '640',
      15,
    ),
    trade(
      2,
      'u-bob',
      'BTC-USD',
      OrderSide.SELL,
      '655000',
      '5000000',
      '328',
      14,
    ),
    trade(
      1,
      'u-alice',
      'BTC-USD',
      OrderSide.BUY,
      '645000',
      '5000000',
      '323',
      13,
    ),
    trade(
      3,
      'u-carol',
      'ETH-USD',
      OrderSide.BUY,
      '310000',
      '40000000',
      '1240',
      12,
    ),
    trade(
      4,
      'u-dave',
      'ETH-USD',
      OrderSide.SELL,
      '325000',
      '60000000',
      '1950',
      11,
    ),
    trade(
      3,
      'u-carol',
      'ETH-USD',
      OrderSide.BUY,
      '315000',
      '20000000',
      '630',
      10,
    ),
    trade(
      5,
      'u-erin',
      'SOL-USD',
      OrderSide.BUY,
      '14500',
      '200000000',
      '290',
      9,
    ),
    trade(
      6,
      'u-alice',
      'SOL-USD',
      OrderSide.SELL,
      '15200',
      '100000000',
      '152',
      8,
    ),
    trade(
      5,
      'u-erin',
      'SOL-USD',
      OrderSide.BUY,
      '14800',
      '300000000',
      '444',
      7,
    ),
    trade(7, 'u-bob', 'XRP-USD', OrderSide.BUY, '42', '30000000000', '126', 6),
    trade(
      8,
      'u-carol',
      'XRP-USD',
      OrderSide.SELL,
      '55',
      '20000000000',
      '110',
      5,
    ),
    trade(7, 'u-bob', 'XRP-USD', OrderSide.BUY, '45', '10000000000', '45', 4),
    trade(
      9,
      'u-dave',
      'DOGE-USD',
      OrderSide.BUY,
      '11',
      '150000000000',
      '165',
      3,
    ),
    trade(
      10,
      'u-erin',
      'DOGE-USD',
      OrderSide.SELL,
      '13',
      '80000000000',
      '104',
      2,
    ),
    trade(
      9,
      'u-dave',
      'DOGE-USD',
      OrderSide.BUY,
      '12',
      '100000000000',
      '120',
      1,
    ),
  ];
}
