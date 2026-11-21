import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [CompaniesModule],
  controllers: [AdminController],
  providers: [AdminTokenGuard],
})
export class AdminModule {}
