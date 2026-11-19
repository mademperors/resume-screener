import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Company } from '../companies/company.entity.js';
import { Job } from '../jobs/job.entity.js';

/** Processing status. Values are the texts recruiters see. */
export enum ResumeStatus {
  Queued = 'Queued',
  Processing = 'Processing',
  Processed = 'Processed',
  ProcessingFailed = 'Processing failed',
  CouldNotReadFile = 'Could not read file',
}

/**
 * An uploaded resume file. The file itself lives in object storage; this row
 * holds its metadata and processing state. It is saved before it is queued, so
 * no upload is lost if queueing fails.
 */
@Entity('resumes')
@Index(['jobId', 'sha256'])
@Index(['jobId', 'status'])
@Index(['status', 'queuedAt'])
export class Resume {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Relation<Company>;

  @Column('uuid')
  jobId: string;

  @ManyToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Relation<Job>;

  @Column({ type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column('int')
  sizeBytes: number;

  /** SHA-256 of the file contents, to detect the same resume uploaded twice. */
  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'varchar', length: 500 })
  storageKey: string;

  @Column({ type: 'enum', enum: ResumeStatus, default: ResumeStatus.Queued })
  status: ResumeStatus;

  /** Processing attempts so far, across all retries. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  /** Times the periodic task re-queued this resume after it failed. */
  @Column({ type: 'int', default: 0 })
  autoRetryCount: number;

  /** Readable reason for the last failure, shown to recruiters. */
  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz' })
  queuedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt: Date | null;

  /** When processing last finished, successfully or not. */
  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
