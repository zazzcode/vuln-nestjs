import { NotFoundException } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DecimalScalar } from '@zazzles/exchange-graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';
import { COIN_SCALE, costOf, requireAboveZero } from '../money/money.js';
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

/** Buys at the market's price. The caller names a quantity; the price is not theirs to name. */
@Resolver()
export class BuyAtMarketResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  @Mutation(() => Order)
  async buyAtMarket(
    @UserId() caller: string,
    @Args('symbol', { type: () => String }) symbol: string,
    @Args('quantity', { type: () => DecimalScalar }) quantity: string,
  ): Promise<Order> {
    const minorQuantity = requireAboveZero(quantity, COIN_SCALE, 'quantity');
    return this.dataSource.transaction(async (manager) => {
      const market = await manager.findOneBy(MarketEntity, { symbol });
      if (market === null) {
        throw new NotFoundException(`There is no market ${symbol}`);
      }
      // The price is computed on the server: it is the reference price itself.
      // Nothing is added to it, so a buy never pays above the reference.
      const price = BigInt(market.referencePrice);
      const cost = costOf(
        minorQuantity,
        String(price),
        COIN_SCALE,
        Decimal.ROUND_HALF_UP,
      );
      await this.wallets.adjust(
        caller,
        'USD',
        `-${cost}`,
        LedgerKind.TRADE_BUY,
        'market',
        manager,
      );
      await this.wallets.adjust(
        caller,
        market.baseAsset,
        minorQuantity,
        LedgerKind.TRADE_BUY,
        'market',
        manager,
      );
      const placed = manager.create(OrderEntity, {
        userId: caller,
        reference: null,
        symbol,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        limitPrice: String(price),
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
      return toOrder(placed);
    });
  }
}
