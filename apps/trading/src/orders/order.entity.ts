import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
}

/**
 * An order as it is stored. Money is an integer in minor units: dollars in
 * cents, coins in hundred-millionths. The price is in cents for one coin.
 */
@Entity('orders')
@Index(['symbol', 'status'])
@Index(['userId', 'createdAt'])
export class OrderEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** The user who placed it. There is no foreign key: the user lives in another store. */
  @Column({ length: 26 })
  userId: string;

  /** How the lab's other parts name this order: `ord-`, then its id. Given once the row has an id. */
  @Index(['reference'], { unique: true })
  @Column({ type: 'varchar', length: 32, nullable: true })
  reference: string | null;

  @Column({ length: 16 })
  symbol: string;

  @Column({ type: 'enum', enum: OrderSide })
  side: OrderSide;

  @Column({ type: 'enum', enum: OrderType })
  type: OrderType;

  /** The limit of a limit order, the price a market order filled at. A `bigint`, which the driver returns as a string. */
  @Column({ type: 'bigint' })
  limitPrice: string;

  /** In hundred-millionths of the base asset. */
  @Column({ type: 'bigint' })
  quantity: string;

  /** A free-text note the user may attach. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  memo: string | null;

  @Column({ type: 'enum', enum: OrderStatus })
  status: OrderStatus;

  @Column({ type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ type: 'datetime', precision: 3 })
  updatedAt: Date;
}
