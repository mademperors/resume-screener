import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { numericTransformer } from '../database/numeric.transformer.js';
import { Job } from './job.entity.js';
import type { RequirementSpec } from './requirements.js';

/**
 * An immutable snapshot of how a job is scored. Changing the job's
 * requirements creates a new version; each evaluation references the version
 * it was produced with.
 */
@Entity('scoring_config_versions')
@Unique(['jobId', 'version'])
export class ScoringConfigVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  jobId: string;

  @ManyToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Relation<Job>;

  /** 1, 2, 3… per job. */
  @Column('int')
  version: number;

  @Column('jsonb')
  requirements: RequirementSpec[];

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    transformer: numericTransformer,
  })
  manualReviewConfidenceThreshold: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
