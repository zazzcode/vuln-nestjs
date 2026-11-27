import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { AlertEntity } from './alert.entity.js';

/** The `alerts` table. The only place in this service that writes a query for it. */
@Injectable()
export class AlertsRepository {
  constructor(
    @InjectRepository(AlertEntity)
    private readonly rows: Repository<AlertEntity>,
  ) {}

  findAll(): Promise<AlertEntity[]> {
    return this.rows.find({ order: { id: 'ASC' } });
  }

  findByUserId(userId: string): Promise<AlertEntity[]> {
    return this.rows.find({ where: { userId }, order: { id: 'ASC' } });
  }

  findById(id: number): Promise<AlertEntity | null> {
    return this.rows.findOneBy({ id });
  }

  /** Every enabled alert. What the evaluation walks. */
  findEnabled(): Promise<AlertEntity[]> {
    return this.rows.find({ where: { enabled: true }, order: { id: 'ASC' } });
  }

  insert(alerts: DeepPartial<AlertEntity>[]): Promise<void> {
    return alerts.length === 0
      ? Promise.resolve()
      : this.rows.insert(alerts).then(() => undefined);
  }

  save(alert: DeepPartial<AlertEntity> & { id: number }): Promise<AlertEntity> {
    return this.rows.save(alert);
  }

  async remove(id: number): Promise<void> {
    await this.rows.delete(id);
  }

  /** Empties the table. */
  clear(): Promise<void> {
    return this.rows.clear();
  }
}
