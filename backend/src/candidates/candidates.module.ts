import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller.js';

@Module({
  controllers: [CandidatesController],
})
export class CandidatesModule {}
