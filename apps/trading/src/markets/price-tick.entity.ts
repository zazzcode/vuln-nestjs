import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One move of a market's reference price. Prices are in cents. */
@Entity('price_ticks')
@Index(['createdAt'])
export class PriceTickEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 16 })
  symbol: string;

  @Column({ type: 'bigint' })
  previousPrice: string;

  @Column({ type: 'bigint' })
  newPrice: string;

  @Column({ type: 'datetime', precision: 3 })
  createdAt: Date;
}
