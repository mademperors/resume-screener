import { Module } from '@nestjs/common';
import { ResumesController } from './resumes.controller.js';

@Module({
  controllers: [ResumesController],
})
export class ResumesModule {}
