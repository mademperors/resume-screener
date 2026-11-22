import { Module } from '@nestjs/common';
import { CompaniesRepository } from './companies.repository.js';
import { CompanyPlansService } from './company-plans.service.js';

/** Companies and their plans. Depends on nothing but the database. */
@Module({
  providers: [CompaniesRepository, CompanyPlansService],
  exports: [CompaniesRepository, CompanyPlansService],
})
export class CompaniesModule {}
