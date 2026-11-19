import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '../jobs/jobs.module.js';
import { ResumeRemovalModule } from './resume-removal.module.js';
import { Resume } from './resume.entity.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resume]),
    JobsModule,
    ResumeRemovalModule,
  ],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService, ResumeRemovalModule],
})
export class ResumesModule {}
