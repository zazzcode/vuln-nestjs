import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { DataSource } from 'typeorm';
import { OrderEntity } from './order.entity.js';
import { Order } from './order.model.js';
import { toOrder } from './orders.service.js';

/** An order by the reference this service gave it. */
@Resolver()
export class OrderByReferenceResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** Raw SQL, with a `?` for the only value the caller chose. Then the ownership check. */
  @Query(() => Order, { nullable: true })
  async orderByReference(
    @CurrentUser() caller: TokenPayload,
    @Args('ref', { type: () => String }) ref: string,
  ): Promise<Order | null> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      'SELECT id, userId, reference, symbol, side, type, limitPrice, quantity, memo, status, createdAt, updatedAt FROM orders WHERE reference = ?',
      [ref],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundException(`There is no order ${ref}`);
    }
    const order = toOrder(row as unknown as OrderEntity);
    if (order.userId !== caller.sub && caller.role !== 'ADMIN') {
      throw new ForbiddenException(
        'An order is read by the user who placed it',
      );
    }
    return order;
  }
}
