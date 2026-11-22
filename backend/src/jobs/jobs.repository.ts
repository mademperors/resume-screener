import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  IsNull,
  LessThan,
  MoreThan,
  type DeepPartial,
  type EntityManager,
} from 'typeorm';
import { Job, JobStatus } from './job.entity.js';
import { ScoringConfigVersion } from './scoring-config-version.entity.js';

/**
 * Database access for jobs and their scoring config versions. Methods that
 * take `tx` join the caller's transaction.
 */
@Injectable()
export class JobsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  findById(id: string): Promise<Job | null> {
    return this.jobs().findOneBy({ id });
  }

  /** Also finds soft-deleted jobs. */
  findByIdWithDeleted(id: string): Promise<Job | null> {
    return this.jobs().findOne({ where: { id }, withDeleted: true });
  }

  /** Locks the job row until the transaction ends. */
  lockForUpdate(id: string, tx: EntityManager): Promise<Job> {
    return this.jobs(tx).findOneOrFail({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  listByCompany(companyId: string, status?: JobStatus): Promise<Job[]> {
    return this.jobs().find({
      where: { companyId, ...(status ? { status } : {}) },
      order: { createdAt: 'DESC' },
    });
  }

  create(data: DeepPartial<Job>, tx?: EntityManager): Promise<Job> {
    const jobs = this.jobs(tx);
    return jobs.save(jobs.create(data));
  }

  save(job: Job, tx?: EntityManager): Promise<Job> {
    return this.jobs(tx).save(job);
  }

  async update(
    id: string,
    patch: DeepPartial<Job>,
    tx?: EntityManager,
  ): Promise<void> {
    await this.jobs(tx).update(id, patch as never);
  }

  async softDelete(id: string): Promise<void> {
    await this.jobs().softDelete(id);
  }

  /** Removes jobs for good; their scoring configs go with them (CASCADE). */
  async deletePermanently(ids: string[]): Promise<void> {
    if (ids.length > 0) {
      await this.jobs().delete(ids);
    }
  }

  /** Ids of jobs soft-deleted before the cutoff. */
  async deletedBefore(cutoff: Date, limit: number): Promise<string[]> {
    const jobs = await this.jobs().find({
      where: { deletedAt: LessThan(cutoff) },
      withDeleted: true,
      select: { id: true },
      take: limit,
    });
    return jobs.map((job) => job.id);
  }

  /** Ids of jobs closed (not deleted) before the cutoff, in id order after `afterId`. */
  async closedBefore(
    cutoff: Date,
    afterId: string | null,
    limit: number,
  ): Promise<string[]> {
    const jobs = await this.jobs().find({
      where: {
        status: JobStatus.Closed,
        closedAt: LessThan(cutoff),
        deletedAt: IsNull(),
        ...(afterId ? { id: MoreThan(afterId) } : {}),
      },
      select: { id: true },
      order: { id: 'ASC' },
      take: limit,
    });
    return jobs.map((job) => job.id);
  }

  findConfig(id: string): Promise<ScoringConfigVersion> {
    return this.configs().findOneByOrFail({ id });
  }

  findConfigInTransaction(
    id: string,
    tx: EntityManager,
  ): Promise<ScoringConfigVersion> {
    return this.configs(tx).findOneByOrFail({ id });
  }

  createConfig(
    data: DeepPartial<ScoringConfigVersion>,
    tx: EntityManager,
  ): Promise<ScoringConfigVersion> {
    const configs = this.configs(tx);
    return configs.save(configs.create(data));
  }

  /** Version numbers of the given config versions, by id. */
  async versionNumbers(ids: readonly string[]): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const versions = await this.configs().find({
      where: { id: In([...ids]) },
      select: { id: true, version: true },
    });
    return new Map(versions.map((v) => [v.id, v.version]));
  }

  private jobs(tx?: EntityManager) {
    return (tx ?? this.db.manager).getRepository(Job);
  }

  private configs(tx?: EntityManager) {
    return (tx ?? this.db.manager).getRepository(ScoringConfigVersion);
  }
}
