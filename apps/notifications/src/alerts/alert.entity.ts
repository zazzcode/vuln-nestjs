import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** The two ways an alert can point. */
export type AlertDirection = 'ABOVE' | 'BELOW';

/**
 * An alert as it is stored. `threshold` is a decimal string compared by
 * value, never as text and never through a float.
 */
@Entity('alerts')
export class AlertEntity {
  /**
   * The seed gives its own rows fixed ids. SQLite does not start a generated
   * id again at 1 when the rows are deleted, so the seed also resets the counter.
   */
  @PrimaryGeneratedColumn()
  id: number;

  /** The user the alert belongs to, by the fixed identifier of a fake user. */
  @Column({ length: 26 })
  userId: string;

  @Column({ length: 16 })
  symbol: string;

  @Column({ type: 'varchar', length: 5 })
  direction: AlertDirection;

  /** A decimal string, such as `70000.00`. */
  @Column({ type: 'varchar', length: 40 })
  threshold: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string | null;

  /** Only a smart alert has one. It is stored as it was given. */
  @Column({ type: 'text', nullable: true })
  expression: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastTriggeredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
