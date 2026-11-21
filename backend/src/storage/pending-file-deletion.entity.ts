import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A stored file whose database record is gone but which storage hasn't
 * confirmed deleting yet. Retried until it succeeds, so deleted candidates'
 * files are really removed (within 24 hours).
 */
@Entity('pending_file_deletions')
export class PendingFileDeletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  storageKey: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
