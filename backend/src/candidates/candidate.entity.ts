import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Company } from '../companies/company.entity.js';
import { numericTransformer } from '../database/numeric.transformer.js';
import { Job } from '../jobs/job.entity.js';
import { Resume } from '../resumes/resume.entity.js';
import type { CandidateFlag } from './evaluation.types.js';

/** The recruiter's decision on a candidate. */
export enum CandidateDecision {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

/**
 * A person behind one processed resume, with the latest evaluation's results
 * copied here for fast sorting and filtering. Contacts are stored for the
 * recruiter only and are never sent to the screening model.
 */
@Entity('candidates')
@Index(['jobId', 'belowThreshold', 'matchScore'])
// GIN index created in the migration; TypeORM can't declare the index type.
@Index('IDX_candidates_skills_normalized', { synchronize: false })
export class Candidate {
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

  @Column({ type: 'uuid', unique: true })
  resumeId: string;

  @OneToOne(() => Resume, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resumeId' })
  resume: Relation<Resume>;

  @Column({ type: 'varchar', length: 200, nullable: true })
  fullName: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null;

  @Column({
    type: 'enum',
    enum: CandidateDecision,
    default: CandidateDecision.Pending,
  })
  decision: CandidateDecision;

  /** 0–100, from the latest evaluation. */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  matchScore: number | null;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
    transformer: numericTransformer,
  })
  experienceYears: number | null;

  /** Skills found in the resume, as written there. */
  @Column('text', { array: true, default: () => "'{}'" })
  skills: string[];

  /** Lower-cased `skills`, for filtering. */
  @Column('text', { array: true, default: () => "'{}'" })
  skillsNormalized: string[];

  /** Job skills the resume doesn't show. */
  @Column('text', { array: true, default: () => "'{}'" })
  missingSkills: string[];

  @Column('text', { array: true, default: () => "'{}'" })
  flags: CandidateFlag[];

  /** Match score is under the job's minimum; listed separately at the bottom. */
  @Column({ type: 'boolean', default: false })
  belowThreshold: boolean;

  @Column({ type: 'uuid', nullable: true })
  latestEvaluationId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
