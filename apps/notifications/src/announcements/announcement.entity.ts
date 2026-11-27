import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** An announcement as it is stored. */
@Entity('announcements')
export class AnnouncementEntity {
  /**
   * The seed gives its own row a fixed id. SQLite does not start a generated
   * id again at 1 when the rows are deleted, so the seed also resets the counter.
   */
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** The administrator who sent it, by the fixed identifier of the fake administrator. */
  @Column({ length: 26 })
  authorId: string;

  @CreateDateColumn()
  createdAt: Date;
}
