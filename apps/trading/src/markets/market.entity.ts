import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** A market as it is stored. The price is in cents: dollars are the quote asset of every market. */
@Entity('markets')
@Index(['symbol'], { unique: true })
export class MarketEntity {
  /** `BTC-USD`: the base asset against the quote asset. */
  @PrimaryColumn({ length: 16 })
  symbol: string;

  @Column({ length: 8 })
  baseAsset: string;

  @Column({ length: 8 })
  quoteAsset: string;

  /** The price the last tick left, in cents. A `bigint`, which the driver returns as a string. */
  @Column({ type: 'bigint' })
  referencePrice: string;

  /** When the reference price was last moved. */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  tickedAt: Date | null;
}
