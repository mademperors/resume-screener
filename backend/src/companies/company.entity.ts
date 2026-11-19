import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Pricing plans. Each plan's API rate limit comes from configuration
 * (PLAN_STANDARD_RATE_LIMIT, PLAN_EXTENDED_RATE_LIMIT).
 */
export enum CompanyPlan {
  Standard = 'standard',
  Extended = 'extended',
}

/** A client company (tenant). All jobs, candidates and API keys belong to one. */
@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Google Workspace domain; users signing in from it join this company. */
  @Column({ type: 'varchar', nullable: true, unique: true })
  googleDomain: string | null;

  @Column({ type: 'enum', enum: CompanyPlan, default: CompanyPlan.Standard })
  plan: CompanyPlan;

  /**
   * Requests per minute for each API key, replacing the plan's limit for this
   * company (e.g. a negotiated deal). Null: the plan decides.
   */
  @Column({ type: 'int', nullable: true })
  customRateLimitPerMinute: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
