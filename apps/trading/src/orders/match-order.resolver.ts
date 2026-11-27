import { NotFoundException } from '@nestjs/common';
import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { Roles } from '@zazzles/exchange-internal-auth';
import { InjectDataSource } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';
import { COIN_SCALE, costOf } from '../money/money.js';
import { MarketEntity } from '../markets/market.entity.js';
import { TradeEntity } from '../trades/trade.entity.js';
import { LedgerKind } from '../wallets/ledger-entry.entity.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { OrderEntity, OrderSide, OrderStatus } from './order.entity.js';
import { Order } from './order.model.js';
import { referenceOf, toOrder } from './orders.service.js';

/** Fills an open order now, by hand. An administrator's operation. */
@Resolver()
export class MatchOrderResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  @Roles('ADMIN')
  @Mutation(() => Order)
  async matchOrder(
    @Args('orderId', { type: () => ID }) orderId: string,
  ): Promise<Order> {
    const rows = this.dataSource.getRepository(OrderEntity);
    const order = await rows.findOneBy({ id: Number(orderId) });
    if (order === null) {
      throw new NotFoundException(`There is no order ${orderId}`);
    }
    if (order.status !== OrderStatus.OPEN) {
      return toOrder(order);
    }
    // LOGIC-005 / CWE-362: the credit and the fill are two writes in no transaction; two callers both see the order OPEN
    const market = await this.dataSource
      .getRepository(MarketEntity)
      .findOneBy({ symbol: order.symbol });
    if (market === null) {
      throw new NotFoundException(`There is no market ${order.symbol}`);
    }
    if (order.side === OrderSide.BUY) {
      await this.wallets.adjust(
        order.userId,
        market.baseAsset,
        order.quantity,
        LedgerKind.TRADE_BUY,
        referenceOf(order.id),
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
      );
    }
    await rows.update(
      { id: order.id },
      { status: OrderStatus.FILLED, updatedAt: new Date() },
    );
    await this.dataSource.getRepository(TradeEntity).insert({
      orderId: order.id,
      tickId: null,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      price: order.limitPrice,
      quantity: order.quantity,
      fee: '0',
      executedAt: new Date(),
    });
    return toOrder({ ...order, status: OrderStatus.FILLED });
  }
}
