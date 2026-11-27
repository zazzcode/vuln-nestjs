import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { UserId } from '@zazzles/exchange-internal-auth';
import { InjectDataSource } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';
import { COIN_SCALE, costOf } from '../money/money.js';
import { MarketEntity } from '../markets/market.entity.js';
import { LedgerKind } from '../wallets/ledger-entry.entity.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { OrderEntity, OrderSide, OrderStatus } from './order.entity.js';
import { Order } from './order.model.js';
import { referenceOf, toOrder } from './orders.service.js';

/** Cancels an open order of the caller's and returns the funds it held. */
@Resolver()
export class CancelOrderResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  @Mutation(() => Order)
  async cancelOrder(
    @UserId() caller: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Order> {
    const whole = Number(id);
    if (!Number.isInteger(whole)) {
      throw new BadRequestException(
        `An order is asked for by its number: ${JSON.stringify(id)} is not one`,
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOneBy(OrderEntity, { id: whole });
      if (order === null) {
        throw new NotFoundException(`There is no order ${id}`);
      }
      if (order.userId !== caller) {
        throw new ForbiddenException(
          'An order is cancelled by the user who placed it',
        );
      }
      if (order.status !== OrderStatus.OPEN) {
        throw new ConflictException(`Order ${id} is not open`);
      }
      // The funds an open limit order held go back: dollars for a buy, the coin for a sell.
      if (order.type === 'LIMIT') {
        const market = await manager.findOneBy(MarketEntity, {
          symbol: order.symbol,
        });
        if (market !== null) {
          if (order.side === OrderSide.BUY) {
            const cost = costOf(
              order.quantity,
              order.limitPrice,
              COIN_SCALE,
              Decimal.ROUND_HALF_UP,
            );
            await this.wallets.adjust(
              caller,
              'USD',
              cost,
              LedgerKind.REFUND,
              referenceOf(order.id),
              manager,
            );
          } else {
            await this.wallets.adjust(
              caller,
              market.baseAsset,
              order.quantity,
              LedgerKind.REFUND,
              referenceOf(order.id),
              manager,
            );
          }
        }
      }
      await manager.update(
        OrderEntity,
        { id: order.id, status: OrderStatus.OPEN },
        { status: OrderStatus.CANCELLED, updatedAt: new Date() },
      );
      return toOrder(order, { status: OrderStatus.CANCELLED });
    });
  }
}
