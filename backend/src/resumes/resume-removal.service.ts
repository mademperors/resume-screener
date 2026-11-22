import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FileStorage } from '../storage/file-storage.js';
import type { PendingFileDeletion } from '../storage/pending-file-deletion.entity.js';
import { PendingFileDeletionsRepository } from '../storage/pending-file-deletions.repository.js';
import { ResumesRepository } from './resumes.repository.js';

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
    @InjectDataSource() private readonly db: DataSource,
    private readonly resumes: ResumesRepository,
    private readonly pendingDeletions: PendingFileDeletionsRepository,
    private readonly storage: FileStorage,
  ) {}

  /** Returns how many resumes were deleted. */
  async removeResumes(
    criteria: { ids: string[] } | { jobIds: string[] },
  ): Promise<number> {
    const keys = 'ids' in criteria ? criteria.ids : criteria.jobIds;
    if (keys.length === 0) {
      return 0;
    }
    const pending = await this.db.transaction(async (tx) => {
      const resumes = await this.resumes.findForRemoval(criteria, tx);
      if (resumes.length === 0) {
        return [];
      }
      const rows = await this.pendingDeletions.add(
        resumes.map((resume) => resume.storageKey),
        tx,
      );
      await this.resumes.deleteByIds(
        resumes.map((resume) => resume.id),
        tx,
      );
      return rows;
    });
    await this.deleteFiles(pending);
    return pending.length;
  }

  /** Retries files that couldn't be deleted before. Returns how many are left. */
  async retryPendingDeletions(limit = 500): Promise<number> {
    await this.deleteFiles(await this.pendingDeletions.oldest(limit));
    return this.pendingDeletions.count();
  }

  private async deleteFiles(pending: PendingFileDeletion[]): Promise<void> {
    for (const row of pending) {
      try {
        await this.storage.delete(row.storageKey);
        await this.pendingDeletions.done(row.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Deleting stored file failed; will retry: ${message}`);
        await this.pendingDeletions.failed(row, message).catch(() => undefined);
      }
    }
  }
}
