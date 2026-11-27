import { NotFoundException } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrderEntity } from './order.entity.js';
import { Order } from './order.model.js';
import { toOrder } from './orders.service.js';

/** An order by the identifier exactly as the caller writes it. */
@Resolver()
export class OrderLookupResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Query(() => Order, { nullable: true })
  async orderLookup(
    @Args('id', { type: () => String }) id: string,
  ): Promise<Order | null> {
    // SQL-001 / CWE-89: an untagged template literal is concatenation; the id arrives as SQL text, not as a value
    const query = `SELECT id, userId, reference, symbol, side, type, limitPrice, quantity, memo, status, createdAt, updatedAt FROM orders WHERE id = ${id} LIMIT 1`;
    const rows =
      await this.dataSource.query<Array<Record<string, unknown>>>(query);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundException(`There is no order ${id}`);
    }
    return toOrder(row as unknown as OrderEntity);
  }
}
