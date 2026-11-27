import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One wallet as it is stored. The balance is an integer in the asset's minor units, and is never negative. */
@Entity('wallets')
@Index(['userId', 'asset'], { unique: true })
export class WalletEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 26 })
  userId: string;

  /** `USD`, or the base asset of a market. */
  @Column({ length: 8 })
  asset: string;

  /** A `bigint`, which the driver returns as a string: exact, at any size. */
  @Column({ type: 'bigint' })
  balance: string;
}
