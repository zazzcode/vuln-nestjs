import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

/** An order as it is stored. Money is an integer in minor units: dollars in cents, coins in hundred-millionths. */
@Entity('orders')
@Index(['symbol', 'status'])
@Index(['userId', 'createdAt'])
export class OrderEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** The user who placed it. There is no foreign key: the user lives in another store. */
  @Column({ length: 26 })
  userId: string;

  @Column({ length: 16 })
  symbol: string;

  @Column({ type: 'enum', enum: OrderSide })
  side: OrderSide;

  @Column({ type: 'enum', enum: OrderType })
  type: OrderType;

  /** A `bigint` in MySQL, which the driver returns as a string: exact, at any size. */
  @Column({ type: 'bigint' })
  limitPrice: string;

  @Column({ type: 'bigint' })
  quantity: string;

  /** A free-text note the user may attach. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  memo: string | null;

  @Column({ type: 'enum', enum: OrderStatus })
  status: OrderStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
