import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyPlansService } from './company-plans.service.js';
import { Company } from './company.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  providers: [CompanyPlansService],
  exports: [CompanyPlansService],
})
export class CompaniesModule {}
