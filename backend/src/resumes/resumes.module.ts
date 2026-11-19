import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '../jobs/jobs.module.js';
import { ResumeRemovalService } from './resume-removal.service.js';
import { Resume } from './resume.entity.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Resume]), JobsModule],
  controllers: [ResumesController],
  providers: [ResumesService, ResumeRemovalService],
  exports: [ResumesService, ResumeRemovalService],
})
export class ResumesModule {}
