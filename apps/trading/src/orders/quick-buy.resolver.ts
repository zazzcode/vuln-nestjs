import { NotFoundException } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';
import {
  COIN_SCALE,
  DOLLAR_SCALE,
  costOf,
  requireAboveZero,
} from '../money/money.js';
import { MarketEntity } from '../markets/market.entity.js';
import { LedgerKind } from '../wallets/ledger-entry.entity.js';
import { WalletsService } from '../wallets/wallets.service.js';
import {
  OrderEntity,
  OrderSide,
  OrderStatus,
  OrderType,
} from './order.entity.js';
import { Order } from './order.model.js';
import { referenceOf, toOrder } from './orders.service.js';

/** Buys at once, at the price the caller sends with the buy. */
@Resolver()
export class QuickBuyResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  @Mutation(() => Order)
  async quickBuy(
    @UserId() caller: string,
    @Args('symbol', { type: () => String }) symbol: string,
    @Args('quantity', { type: () => DecimalScalar }) quantity: string,
    // LOGIC-003 / CWE-840: the caller's price is the price; a fraction of a coin at a fraction of a cent rounds to nothing
    @Args('price', { type: () => DecimalScalar }) price: string,
  ): Promise<Order> {
    const minorQuantity = requireAboveZero(quantity, COIN_SCALE, 'quantity');
    const minorPrice = requireAboveZero(price, DOLLAR_SCALE, 'price');
    return this.dataSource.transaction(async (manager) => {
      const market = await manager.findOneBy(MarketEntity, { symbol });
      if (market === null) {
        throw new NotFoundException(`There is no market ${symbol}`);
      }
      const cost = costOf(
        minorQuantity,
        minorPrice,
        COIN_SCALE,
        Decimal.ROUND_HALF_UP,
      );
      await this.wallets.adjust(
        caller,
        'USD',
        `-${cost}`,
        LedgerKind.TRADE_BUY,
        'quick buy',
        manager,
      );
      await this.wallets.adjust(
        caller,
        market.baseAsset,
        minorQuantity,
        LedgerKind.TRADE_BUY,
        'quick buy',
        manager,
      );
      const placed = manager.create(OrderEntity, {
        userId: caller,
        reference: null,
        symbol,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        limitPrice: minorPrice,
        quantity: minorQuantity,
        memo: null,
        status: OrderStatus.FILLED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await manager.save(placed);
      await manager.update(
        OrderEntity,
        { id: placed.id },
        { reference: referenceOf(placed.id) },
      );
      return toOrder({ ...placed, reference: referenceOf(placed.id) });
    });
  }
}
