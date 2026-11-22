import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { plansConfig } from '../config/plans.config.js';
import { CompanyPlansService } from './company-plans.service.js';
import { Company } from './company.entity.js';

@Module({
  imports: [
    ConfigModule.forFeature(plansConfig),
    TypeOrmModule.forFeature([Company]),
  ],
  providers: [CompanyPlansService],
  exports: [CompanyPlansService],
})
export class CompaniesModule {}
