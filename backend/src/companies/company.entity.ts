import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const DEFAULT_API_RATE_LIMIT_PER_MINUTE = 200;

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

  /** Requests per minute allowed for each API key; raised on extended plans. */
  @Column({ type: 'int', default: DEFAULT_API_RATE_LIMIT_PER_MINUTE })
  apiRateLimitPerMinute: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
