import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Company } from '../companies/company.entity.js';

/** Key for external systems. Only its hash is stored; the plaintext is shown once. */
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Relation<Company>;

  @Column('uuid')
  createdByUserId: string;

  @Column()
  name: string;

  /** Public, non-secret part of the key, used to look it up. */
  @Column({ type: 'varchar', length: 16, unique: true })
  prefix: string;

  /** SHA-256 of the full key. */
  @Column({ type: 'char', length: 64 })
  keyHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
