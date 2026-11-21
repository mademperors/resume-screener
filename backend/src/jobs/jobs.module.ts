import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './job.entity.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { ScoringConfigVersion } from './scoring-config-version.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job, ScoringConfigVersion])],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
