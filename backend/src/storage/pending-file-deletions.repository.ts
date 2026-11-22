import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { PendingFileDeletion } from './pending-file-deletion.entity.js';

/** Files waiting to be deleted from storage; see PendingFileDeletion. */
@Injectable()
export class PendingFileDeletionsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Records the files to delete, in the caller's transaction. */
  add(
    storageKeys: readonly string[],
    tx: EntityManager,
  ): Promise<PendingFileDeletion[]> {
    const rows = tx.getRepository(PendingFileDeletion);
    return rows.save(
      storageKeys.map((storageKey) =>
        rows.create({ storageKey, attempts: 0, lastError: null }),
      ),
    );
  }

  oldest(limit: number): Promise<PendingFileDeletion[]> {
    return this.rows().find({ order: { createdAt: 'ASC' }, take: limit });
  }

  count(): Promise<number> {
    return this.rows().count();
  }

  async done(id: string): Promise<void> {
    await this.rows().delete(id);
  }

  async failed(row: PendingFileDeletion, message: string): Promise<void> {
    await this.rows().update(row.id, {
      attempts: row.attempts + 1,
      lastError: message,
    });
  }

  private rows() {
    return this.db.getRepository(PendingFileDeletion);
  }
}
