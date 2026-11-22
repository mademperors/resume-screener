import { Module } from '@nestjs/common';
import { ResumesRepository } from './resumes.repository.js';

/** Database access for resumes; see JobsDataModule for why it is separate. */
@Module({
  providers: [ResumesRepository],
  exports: [ResumesRepository],
})
export class ResumesDataModule {}
