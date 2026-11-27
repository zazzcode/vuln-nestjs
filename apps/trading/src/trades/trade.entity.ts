import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OrderSide } from '../orders/order.entity.js';

/**
 * One trade as it is stored: an order filled at a price. The unique key on
 * (`orderId`, `tickId`) is what makes a fill idempotent: a second attempt to
 * fill an order in the same tick cannot insert a second row.
 */
@Entity('trades')
@Index(['symbol', 'executedAt'])
@Index(['orderId', 'tickId'], { unique: true })
export class TradeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  orderId: number;

  /** The tick that filled the order. A seeded trade carries none. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  tickId: string | null;

  @Column({ length: 26 })
  userId: string;

  @Column({ length: 16 })
  symbol: string;

  @Column({ type: 'enum', enum: OrderSide })
  side: OrderSide;

  /** In cents. */
  @Column({ type: 'bigint' })
  price: string;

  /** In the base asset's minor units. */
  @Column({ type: 'bigint' })
  quantity: string;

  /** In cents. */
  @Column({ type: 'bigint' })
  fee: string;

  @Column({ type: 'datetime', precision: 3 })
  executedAt: Date;
}
