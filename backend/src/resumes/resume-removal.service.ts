import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { FileStorage } from '../storage/file-storage.js';
import { PendingFileDeletion } from '../storage/pending-file-deletion.entity.js';
import { Resume } from './resume.entity.js';

/**
 * Permanently deletes resumes with their candidates, evaluations and files.
 * Database rows go in one transaction together with a record of each file to
 * delete; files are then deleted right away, and any that fail are retried
 * by the periodic cleanup until storage confirms.
 */
@Injectable()
export class ResumeRemovalService {
  private readonly logger = new Logger(ResumeRemovalService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: FileStorage,
  ) {}

  /** Returns how many resumes were deleted. */
  async removeResumes(criteria: {
    ids?: string[];
    jobIds?: string[];
  }): Promise<number> {
    const where = criteria.ids
      ? { id: In(criteria.ids) }
      : criteria.jobIds
        ? { jobId: In(criteria.jobIds) }
        : null;
    if (!where || (criteria.ids ?? criteria.jobIds ?? []).length === 0) {
      return 0;
    }
    const pending = await this.dataSource.transaction(async (manager) => {
      const resumes = await manager.find(Resume, {
        where,
        select: { id: true, storageKey: true },
      });
      if (resumes.length === 0) {
        return [];
      }
      const rows = await manager.save(
        resumes.map((resume) =>
          manager.create(PendingFileDeletion, {
            storageKey: resume.storageKey,
            attempts: 0,
            lastError: null,
          }),
        ),
      );
      // Candidates and evaluations go with their resume (ON DELETE CASCADE).
      await manager.delete(Resume, { id: In(resumes.map((r) => r.id)) });
      return rows;
    });
    await this.deleteFiles(pending);
    return pending.length;
  }

  /** Retries files that couldn't be deleted before. Returns how many are left. */
  async retryPendingDeletions(limit = 500): Promise<number> {
    const repository = this.dataSource.getRepository(PendingFileDeletion);
    const pending = await repository.find({
      order: { createdAt: 'ASC' },
      take: limit,
    });
    await this.deleteFiles(pending);
    return repository.count();
  }

  private async deleteFiles(pending: PendingFileDeletion[]): Promise<void> {
    const repository = this.dataSource.getRepository(PendingFileDeletion);
    for (const row of pending) {
      try {
        await this.storage.delete(row.storageKey);
        await repository.delete(row.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Deleting stored file failed; will retry: ${message}`);
        await repository
          .update(row.id, { attempts: row.attempts + 1, lastError: message })
          .catch(() => undefined);
      }
    }
  }
}
