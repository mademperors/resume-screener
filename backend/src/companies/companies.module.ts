import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { plansConfig } from '../config/plans.config.js';
import { CompaniesRepository } from './companies.repository.js';
import { CompanyPlansService } from './company-plans.service.js';

/** Companies and their plans. Depends on nothing but the database. */
@Module({
  imports: [ConfigModule.forFeature(plansConfig)],
  providers: [CompaniesRepository, CompanyPlansService],
  exports: [CompaniesRepository, CompanyPlansService],
})
export class CompaniesModule {}
