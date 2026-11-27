import { NotFoundException } from '@nestjs/common';
import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { Roles } from '@zazzles/exchange-internal-auth';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Order } from './order.model.js';
import { toOrder } from './orders.service.js';
import { MarketEntity } from '../markets/market.entity.js';
import { OrderEntity, OrderSide, OrderStatus } from './order.entity.js';
import { TradeEntity } from '../trades/trade.entity.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { LedgerKind } from '../wallets/ledger-entry.entity.js';
import { COIN_SCALE, costOf } from '../money/money.js';
import { Decimal } from 'decimal.js';
import { referenceOf } from './orders.service.js';

/** Fills an order on a named tick. An administrator's operation, idempotent by design. */
@Resolver()
export class SettleOrderResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  @Roles('ADMIN')
  @Mutation(() => Order, { nullable: true })
  async settleOrder(
    @Args('orderId', { type: () => ID }) orderId: string,
    @Args('tickId', { type: () => ID }) tickId: string,
  ): Promise<Order | null> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOneBy(OrderEntity, {
        id: Number(orderId),
      });
      if (order === null) {
        throw new NotFoundException(`There is no order ${orderId}`);
      }
      // The unique key on (orderId, tickId): settling the same order in the
      // same tick twice cannot write a second trade, so it cannot credit twice.
      try {
        await manager.insert(TradeEntity, {
          orderId: order.id,
          tickId,
          userId: order.userId,
          symbol: order.symbol,
          side: order.side,
          price: order.limitPrice,
          quantity: order.quantity,
          fee: '0',
          executedAt: new Date(),
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
          return toOrder(order);
        }
        throw error;
      }
      const market = await manager.findOneBy(MarketEntity, {
        symbol: order.symbol,
      });
      if (market !== null) {
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
      }
      await manager.update(
        OrderEntity,
        { id: order.id },
        { status: OrderStatus.FILLED, updatedAt: new Date() },
      );
      return toOrder(order, { status: OrderStatus.FILLED });
    });
  }
}
