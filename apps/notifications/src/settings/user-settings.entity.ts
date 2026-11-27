import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** The notification settings of one user: where to reach them and through which channels. */
@Entity('user_settings')
export class UserSettingsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 26, unique: true })
  userId: string;

  /** Where this user's webhooks are delivered. Checked by the outbound guard wherever it is used. */
  @Column({ type: 'text', nullable: true })
  webhookUrl: string | null;

  @Column({ type: 'boolean', default: true })
  email: boolean;

  @Column({ type: 'boolean', default: true })
  sms: boolean;

  @Column({ type: 'boolean', default: true })
  webhook: boolean;
}
