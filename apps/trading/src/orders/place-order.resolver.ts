import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, InputType, Mutation, Resolver } from '@nestjs/graphql';
import { Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString } from 'class-validator';
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

/**
 * What a caller may place. A market order has no price field at all: the
 * server's reference price is what a market order fills at.
 */
@InputType()
export class PlaceOrderInput {
  @IsString()
  @Field(() => String)
  symbol!: string;

  @IsEnum(OrderSide)
  @Field(() => OrderSide)
  side!: OrderSide;

  @IsEnum(OrderType)
  @Field(() => OrderType)
  type!: OrderType;

  @IsString()
  @Field(() => DecimalScalar)
  quantity!: string;

  @IsOptional()
  @IsString()
  @Field(() => DecimalScalar, { nullable: true })
  limitPrice?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  memo?: string;
}

/** Places an order: a limit order takes its funds at once, a market order fills now. */
@Resolver()
export class PlaceOrderResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  @Mutation(() => Order)
  async placeOrder(
    @UserId() caller: string,
    @Args('input', { type: () => PlaceOrderInput }) input: PlaceOrderInput,
  ): Promise<Order> {
    const quantity = requireAboveZero(input.quantity, COIN_SCALE, 'quantity');
    return this.dataSource.transaction(async (manager) => {
      const market = await manager.findOneBy(MarketEntity, {
        symbol: input.symbol,
      });
      if (market === null) {
        throw new NotFoundException(`There is no market ${input.symbol}`);
      }

      let limitPrice: string;
      let status = OrderStatus.OPEN;
      if (input.type === OrderType.LIMIT) {
        if (input.limitPrice === undefined) {
          throw new BadRequestException(
            'A limit order names the price it is willing to trade at',
          );
        }
        limitPrice = requireAboveZero(
          input.limitPrice,
          DOLLAR_SCALE,
          'limitPrice',
        );
        // The funds are taken at once: dollars for a buy, the coin for a sell.
        if (input.side === OrderSide.BUY) {
          const cost = costOf(
            quantity,
            limitPrice,
            COIN_SCALE,
            Decimal.ROUND_HALF_UP,
          );
          await this.wallets.adjust(
            caller,
            'USD',
            `-${cost}`,
            LedgerKind.TRADE_BUY,
            'placed',
            manager,
          );
        } else {
          await this.wallets.adjust(
            caller,
            market.baseAsset,
            `-${quantity}`,
            LedgerKind.TRADE_SELL,
            'placed',
            manager,
          );
        }
      } else {
        // A market order fills at the server's reference price, never at a price the caller sent.
        limitPrice = market.referencePrice;
        status = OrderStatus.FILLED;
        if (input.side === OrderSide.BUY) {
          const cost = costOf(
            quantity,
            limitPrice,
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
            quantity,
            LedgerKind.TRADE_BUY,
            'market',
            manager,
          );
        } else {
          const notional = costOf(
            quantity,
            limitPrice,
            COIN_SCALE,
            Decimal.ROUND_HALF_UP,
          );
          await this.wallets.adjust(
            caller,
            market.baseAsset,
            `-${quantity}`,
            LedgerKind.TRADE_SELL,
            'market',
            manager,
          );
          await this.wallets.adjust(
            caller,
            'USD',
            notional,
            LedgerKind.TRADE_SELL,
            'market',
            manager,
          );
        }
      }

      const placed = manager.create(OrderEntity, {
        userId: caller,
        reference: null,
        symbol: input.symbol,
        side: input.side,
        type: input.type,
        limitPrice,
        quantity,
        memo: input.memo ?? null,
        status,
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
