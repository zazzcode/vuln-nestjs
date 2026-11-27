import { Injectable } from '@nestjs/common';
import { COIN_SCALE, DOLLAR_SCALE, toDecimal } from '../money/money.js';
import { OrderEntity } from './order.entity.js';
import { type Order } from './order.model.js';
import { OrdersRepository } from './orders.repository.js';

export const ORDER_REFERENCE_PREFIX = 'ord-';

/** The reference of an order, from its id. Written once the row has an id. */
export function referenceOf(id: number | string): string {
  return `${ORDER_REFERENCE_PREFIX}${id}`;
}

/** Minor units as the graph carries them: cents become dollars, hundred-millionths become coins. */
export function toOrder(row: OrderEntity): Order {
  return {
    id: String(row.id),
    userId: row.userId,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    limitPrice: toDecimal(row.limitPrice, DOLLAR_SCALE),
    quantity: toDecimal(row.quantity, COIN_SCALE),
    memo: row.memo,
    status: row.status,
    createdAt: row.createdAt,
    user: { id: row.userId, orders: [] },
  };
}

@Injectable()
export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

  /** The orders a user placed. Whoever calls it has already settled whether the caller may see that user's orders. */
  async byUser(userId: string): Promise<Order[]> {
    return (await this.repository.findByUser(userId)).map(toOrder);
  }

  /** One order, or nothing when there is none. */
  async byId(id: number): Promise<Order | null> {
    const row = await this.repository.findById(id);
    return row === null ? null : toOrder(row);
  }
}
