import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A report a user may download. Its name is chosen by the service when the report is made, never by the caller. */
@Entity('reports')
@Index(['userId'])
export class ReportEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 26 })
  userId: string;

  @Column({ length: 32 })
  kind: string;

  /** The file as it is stored under the reports directory. */
  @Column({ length: 64 })
  storedName: string;

  @Column({ type: 'datetime', precision: 3 })
  createdAt: Date;
}
