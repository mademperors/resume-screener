import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Company } from '../companies/company.entity.js';
import { numericTransformer } from '../database/numeric.transformer.js';
import type { SkillWeight } from './requirements.js';

export enum JobStatus {
  Open = 'open',
  Closed = 'closed',
}

/** A vacancy. Its requirements are versioned in ScoringConfigVersion. */
@Entity('jobs')
@Index(['companyId', 'createdAt'])
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Relation<Company>;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column('text')
  description: string;

  @Column('text', { array: true })
  requiredSkills: string[];

  @Column('text', { array: true, default: () => "'{}'" })
  preferredSkills: string[];

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    transformer: numericTransformer,
  })
  minExperienceYears: number;

  /** Candidates scoring below this (0–100) are listed separately at the bottom. */
  @Column({ type: 'smallint', default: 0 })
  minMatchScore: number;

  // Scoring settings (see ScoringSettings); frozen into each config version.

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 2,
    transformer: numericTransformer,
  })
  requiredSkillWeight: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 1,
    transformer: numericTransformer,
  })
  preferredSkillWeight: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 2,
    transformer: numericTransformer,
  })
  experienceWeight: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  skillWeights: SkillWeight[];

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0.6,
    transformer: numericTransformer,
  })
  manualReviewThreshold: number;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.Open })
  status: JobStatus;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /**
   * Scoring config used for new evaluations. Not a foreign key, to avoid a
   * cycle with scoring_config_versions.jobId.
   */
  @Column({ type: 'uuid', nullable: true })
  currentConfigVersionId: string | null;

  /** Null when the job was created through an API key. */
  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  /** Soft delete; candidate data is purged a year later by retention. */
  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
