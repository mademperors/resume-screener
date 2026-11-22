import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CompaniesModule } from '../companies/companies.module.js';
import { adminConfig } from '../config/admin.config.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [ConfigModule.forFeature(adminConfig), CompaniesModule],
  controllers: [AdminController],
  providers: [AdminTokenGuard],
})
export class AdminModule {}
