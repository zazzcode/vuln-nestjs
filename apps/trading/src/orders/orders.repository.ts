import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { OrderEntity } from './order.entity.js';

/** The `orders` table. The only place in this service that writes a query for it. */
@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly rows: Repository<OrderEntity>,
  ) {}

  findByUser(userId: string): Promise<OrderEntity[]> {
    return this.rows.find({ where: { userId }, order: { id: 'ASC' } });
  }

  findById(id: number): Promise<OrderEntity | null> {
    return this.rows.findOneBy({ id });
  }

  /** Empties the table. On MySQL this is a `TRUNCATE`, so the first row gets id 1 again. */
  clear(): Promise<void> {
    return this.rows.clear();
  }

  insert(orders: DeepPartial<OrderEntity>[]): Promise<void> {
    return orders.length === 0
      ? Promise.resolve()
      : this.rows.insert(orders).then(() => undefined);
  }
}
