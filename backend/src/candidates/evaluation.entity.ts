import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { numericTransformer } from '../database/numeric.transformer.js';
import { ScoringConfigVersion } from '../jobs/scoring-config-version.entity.js';
import { Candidate } from './candidate.entity.js';
import type {
  CandidateFlag,
  RequirementContribution,
  RequirementVerdict,
} from './evaluation.types.js';

/**
 * One scoring run of a resume: the model's verdicts and the score computed
 * from them. Kept per run, so each result can be traced to the config and
 * model version that produced it.
 */
@Entity('evaluations')
@Index(['candidateId', 'createdAt'])
export class Evaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  companyId: string;

  @Column('uuid')
  candidateId: string;

  @ManyToOne(() => Candidate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateId' })
  candidate: Relation<Candidate>;

  @Column('uuid')
  configVersionId: string;

  @ManyToOne(() => ScoringConfigVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'configVersionId' })
  configVersion: Relation<ScoringConfigVersion>;

  @Column({ type: 'varchar', length: 100 })
  modelName: string;

  @Column({ type: 'varchar', length: 100 })
  modelVersion: string;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  matchScore: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
    transformer: numericTransformer,
  })
  experienceYears: number | null;

  @Column('jsonb')
  verdicts: RequirementVerdict[];

  @Column('jsonb')
  contributions: RequirementContribution[];

  @Column('text', { array: true, default: () => "'{}'" })
  foundSkills: string[];

  @Column('text', { array: true, default: () => "'{}'" })
  missingSkills: string[];

  @Column('text', { array: true, default: () => "'{}'" })
  flags: CandidateFlag[];

  /** Why the resume was flagged, e.g. "Hidden text found…". */
  @Column('text', { array: true, default: () => "'{}'" })
  notes: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
