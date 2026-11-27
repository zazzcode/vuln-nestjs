import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager } from 'typeorm';
import { Decimal } from 'decimal.js';
import { COIN_SCALE, DOLLAR_SCALE, costOf, toDecimal } from '../money/money.js';
import { OrderEntity, OrderSide, OrderStatus } from '../orders/order.entity.js';
import { referenceOf } from '../orders/orders.service.js';
import { TradeEntity } from '../trades/trade.entity.js';
import { LedgerKind } from '../wallets/ledger-entry.entity.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { MarketEntity } from './market.entity.js';
import { type Market } from './market.model.js';
import { PriceTickEntity } from './price-tick.entity.js';

export function toMarket(row: MarketEntity): Market {
  return {
    symbol: row.symbol,
    baseAsset: row.baseAsset as Market['baseAsset'],
    quoteAsset: row.quoteAsset as Market['quoteAsset'],
    referencePrice: toDecimal(row.referencePrice, DOLLAR_SCALE),
    tickedAt: row.tickedAt,
  };
}

/**
 * The steps the price generator takes, as [numerator, denominator] applied to
 * the previous price: deterministic, cycling by how many ticks the market has
 * had. The first step moves every price down two percent.
 */
const TICK_STEPS: ReadonlyArray<
  readonly [numerator: bigint, denominator: bigint]
> = [
  [-2n, 100n],
  [1n, 100n],
  [-1n, 100n],
  [15n, 1000n],
  [-5n, 1000n],
];

/** The markets and their reference prices. */
@Injectable()
export class MarketsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  async bySymbol(symbol: string): Promise<Market | null> {
    const row = await this.dataSource
      .getRepository(MarketEntity)
      .findOneBy({ symbol });
    return row === null ? null : toMarket(row);
  }

  /**
   * One tick of every market: a new price from the seeded generator, and the
   * resting limit orders the new price crossed, filled. The whole tick is one
   * transaction: the crossed orders are locked with `FOR UPDATE`, and an order
   * is filled by a conditional update on its status, so no order fills twice
   * however many callers tick at once.
   */
  async tick(): Promise<Market[]> {
    return this.dataSource.transaction(async (manager) => {
      const tickedAt = new Date();
      const updated: Market[] = [];
      const markets = await manager.find(MarketEntity, {
        order: { symbol: 'ASC' },
      });
      for (const market of markets) {
        const ticksSoFar = await manager.count(PriceTickEntity, {
          where: { symbol: market.symbol },
        });
        const [numerator, denominator] =
          TICK_STEPS[ticksSoFar % TICK_STEPS.length]!;
        const previous = BigInt(market.referencePrice);
        const next = previous + (previous * numerator) / denominator;
        const tick = manager.create(PriceTickEntity, {
          symbol: market.symbol,
          previousPrice: String(previous),
          newPrice: String(next),
          createdAt: tickedAt,
        });
        await manager.save(tick);
        await manager.update(
          MarketEntity,
          { symbol: market.symbol },
          { referencePrice: String(next), tickedAt },
        );

        const crossed = await manager
          .createQueryBuilder(OrderEntity, 'o')
          .setLock('pessimistic_write')
          .where('o.symbol = :symbol', { symbol: market.symbol })
          .andWhere('o.status = :open', { open: OrderStatus.OPEN })
          .andWhere(
            new Brackets((qb) =>
              qb
                .where('o.side = :buy AND o.limitPrice >= :price', {
                  buy: OrderSide.BUY,
                })
                .orWhere('o.side = :sell AND o.limitPrice <= :price', {
                  sell: OrderSide.SELL,
                }),
            ),
          )
          .setParameter('price', String(next))
          .getMany();
        for (const order of crossed) {
          const filled = await manager.update(
            OrderEntity,
            { id: order.id, status: OrderStatus.OPEN },
            { status: OrderStatus.FILLED, updatedAt: tickedAt },
          );
          if (filled.affected !== 1) {
            continue;
          }
          await this.settle(manager, order, `tick-${tick.id}`, tickedAt);
        }

        market.referencePrice = String(next);
        market.tickedAt = tickedAt;
        updated.push(toMarket(market));
      }
      return updated;
    });
  }

  /** Credits one filled order and writes its trade, inside the caller's transaction. */
  private async settle(
    manager: EntityManager,
    order: OrderEntity,
    tickId: string,
    executedAt: Date,
  ): Promise<void> {
    const market = await manager.findOneBy(MarketEntity, {
      symbol: order.symbol,
    });
    if (market === null) {
      return;
    }
    if (order.side === OrderSide.BUY) {
      await this.wallets.adjust(
        order.userId,
        market.baseAsset,
        order.quantity,
        LedgerKind.TRADE_BUY,
        referenceOf(order.id),
        manager,
      );
    } else {
      const notional = costOf(
        order.quantity,
        order.limitPrice,
        COIN_SCALE,
        Decimal.ROUND_HALF_UP,
      );
      await this.wallets.adjust(
        order.userId,
        'USD',
        notional,
        LedgerKind.TRADE_SELL,
        referenceOf(order.id),
        manager,
      );
    }
    await manager.insert(TradeEntity, {
      orderId: order.id,
      tickId,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      price: order.limitPrice,
      quantity: order.quantity,
      fee: '0',
      executedAt,
    });
  }
}
