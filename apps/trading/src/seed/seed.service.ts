import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrderSide, OrderStatus, OrderType } from '../orders/order.entity.js';
import { OrdersRepository } from '../orders/orders.repository.js';

/**
 * The fake data of this service. Nothing here is real, and nothing is random:
 * every run loads the same rows, with the same identifiers.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly orders: OrdersRepository,
  ) {}

  /** Loads the fake data. Every start does; so does every reset. */
  async load(): Promise<void> {
    // First the tables, because a scenario is allowed to drop one and reset has to undo that.
    await this.dataSource.synchronize();
    await this.orders.clear();
    await this.orders.insert([
      // Alice offers to buy half a bitcoin for 64,000 dollars.
      {
        userId: 'u-alice',
        symbol: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        limitPrice: '6400000',
        quantity: '50000000',
        status: OrderStatus.OPEN,
      },
      // Bob offers to sell two ether for 3,300 dollars each.
      {
        userId: 'u-bob',
        symbol: 'ETH-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        limitPrice: '330000',
        quantity: '200000000',
        status: OrderStatus.OPEN,
      },
    ]);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.load();
  }
}
