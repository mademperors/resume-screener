import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../users/user.entity.js';

/** A web sign-in. Access tokens reference it, so revoking it signs the user out. */
@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  /** SHA-256 of the current refresh token; rotated on every refresh. */
  @Column({ type: 'char', length: 64, unique: true })
  refreshTokenHash: string;

  /** Last authenticated API request; drives the inactivity timeout. */
  @Column({ type: 'timestamptz' })
  lastActivityAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
