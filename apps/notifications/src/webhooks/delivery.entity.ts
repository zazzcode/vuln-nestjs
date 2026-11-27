import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** How one delivery attempt ended. There are no retries, so `PENDING` is rare. */
export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

/** One delivery attempt, recorded whatever happened. `attempts` is always 1: nothing retries. */
@Entity('deliveries')
@Index('deliveries_user_idx', ['userId'])
export class DeliveryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** The alert the delivery is about, or nothing when it was sent on its own. */
  @Column({ type: 'integer', nullable: true })
  alertId: number | null;

  @Column({ length: 26 })
  userId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 9 })
  status: DeliveryStatus;

  @Column({ type: 'integer', default: 1 })
  attempts: number;

  /** Why the delivery failed, when it did: the guard's reason, the answer's status, or how it could not be reached. */
  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  /** What the receiver answered, when anything did. */
  @Column({ type: 'text', nullable: true })
  responseBody: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  deliveredAt: Date | null;
}
