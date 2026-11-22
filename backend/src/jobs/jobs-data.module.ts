import { Module } from '@nestjs/common';
import { JobsRepository } from './jobs.repository.js';

/**
 * Database access for jobs, for any module that needs it. Data modules
 * depend on nothing but the database, so feature modules can import each
 * other's without cycles. Access rules (tenant checks) stay in JobsService.
 */
@Module({
  providers: [JobsRepository],
  exports: [JobsRepository],
})
export class JobsDataModule {}
