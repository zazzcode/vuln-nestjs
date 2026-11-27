import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum LedgerKind {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRADE_BUY = 'TRADE_BUY',
  TRADE_SELL = 'TRADE_SELL',
  FEE = 'FEE',
  REFUND = 'REFUND',
}

/** One movement of money, signed. What a wallet holds is the sum of its entries. */
@Entity('ledger_entries')
@Index(['userId', 'createdAt'])
export class LedgerEntryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 26 })
  userId: string;

  @Column({ length: 8 })
  asset: string;

  /** Signed, in the asset's minor units. */
  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'enum', enum: LedgerKind })
  kind: LedgerKind;

  /** What the movement was for: an order's reference, a trade, a seed marker. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  reference: string | null;

  @Column({ type: 'datetime', precision: 3 })
  createdAt: Date;
}
