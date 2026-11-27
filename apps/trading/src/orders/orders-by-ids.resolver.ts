import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { UserId } from '@zazzles/exchange-internal-auth';
import { DataSource } from 'typeorm';
import { OrderEntity } from './order.entity.js';
import { Order } from './order.model.js';
import { toOrder } from './orders.service.js';

/** The orders of a list of ids. */
@Resolver()
export class OrdersByIdsResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Query(() => [Order])
  async ordersByIds(
    @UserId() caller: string,
    @Args('ids', { type: () => [ID] }) ids: string[],
  ): Promise<Order[]> {
    // SQL-007 / CWE-89: the ids are joined into IN (...); the list is already outside any quote, so nothing has to be escaped
    const query = `SELECT id, userId, reference, symbol, side, type, limitPrice, quantity, memo, status, createdAt, updatedAt FROM orders WHERE userId = '${caller}' AND id IN (${ids.join(', ')})`;
    const rows =
      await this.dataSource.query<Array<Record<string, unknown>>>(query);
    return rows.map((row) => toOrder(row as unknown as OrderEntity));
  }
}
