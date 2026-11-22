import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, type DeepPartial } from 'typeorm';
import { Session } from './session.entity.js';

@Injectable()
export class SessionsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  create(data: DeepPartial<Session>): Promise<Session> {
    return this.sessions().save(this.sessions().create(data));
  }

  findById(id: string): Promise<Session | null> {
    return this.sessions().findOneBy({ id });
  }

  /** The session holding this refresh token hash, with its user. */
  findByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return this.sessions().findOne({
      where: { refreshTokenHash },
      relations: { user: true },
    });
  }

  save(session: Session): Promise<Session> {
    return this.sessions().save(session);
  }

  async update(id: string, patch: DeepPartial<Session>): Promise<void> {
    await this.sessions().update(id, patch as never);
  }

  /**
   * Deletes sessions that can no longer be used: signed out, past their
   * maximum age, or idle since before `idleBefore`. Returns how many.
   */
  async deleteEnded(now: Date, idleBefore: Date): Promise<number> {
    const result = await this.db
      .createQueryBuilder()
      .delete()
      .from(Session)
      .where(
        new Brackets((where) =>
          where
            .where('"revokedAt" IS NOT NULL')
            .orWhere('"expiresAt" < :now')
            .orWhere('"lastActivityAt" < :idleBefore'),
        ),
      )
      .setParameters({ now, idleBefore })
      .execute();
    return result.affected ?? 0;
  }

  private sessions() {
    return this.db.getRepository(Session);
  }
}
