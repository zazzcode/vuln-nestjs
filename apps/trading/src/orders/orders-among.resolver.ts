import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { UserId } from '@zazzles/exchange-internal-auth';
import { In, Repository } from 'typeorm';
import { OrderEntity } from './order.entity.js';
import { Order } from './order.model.js';
import { toOrder } from './orders.service.js';

/** The caller's orders among a list of ids. */
@Resolver()
export class OrdersAmongResolver {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly rows: Repository<OrderEntity>,
  ) {}

  /**
   * A list is bound with `In`, and so is the caller: whatever the list holds,
   * the answer never leaves the caller's own orders.
   */
  @Query(() => [Order])
  async ordersAmong(
    @UserId() caller: string,
    @Args('ids', { type: () => [ID] }) ids: string[],
  ): Promise<Order[]> {
    const numbers = ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id));
    if (numbers.length === 0) {
      return [];
    }
    const rows = await this.rows.find({
      where: { userId: caller, id: In(numbers) },
      order: { id: 'ASC' },
    });
    return rows.map((row) => toOrder(row));
  }
}
