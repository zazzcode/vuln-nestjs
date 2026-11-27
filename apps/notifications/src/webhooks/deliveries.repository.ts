import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { DeliveryEntity } from './delivery.entity.js';

/** The `deliveries` table. The only place in this service that writes a query for it. */
@Injectable()
export class DeliveriesRepository {
  constructor(
    @InjectRepository(DeliveryEntity)
    private readonly rows: Repository<DeliveryEntity>,
  ) {}

  findByUserId(userId: string): Promise<DeliveryEntity[]> {
    return this.rows.find({ where: { userId }, order: { id: 'ASC' } });
  }

  findById(id: number): Promise<DeliveryEntity | null> {
    return this.rows.findOneBy({ id });
  }

  insert(deliveries: DeepPartial<DeliveryEntity>[]): Promise<DeliveryEntity[]> {
    return deliveries.length === 0
      ? Promise.resolve([])
      : this.rows.save(deliveries);
  }

  /** Empties the table. */
  clear(): Promise<void> {
    return this.rows.clear();
  }
}
