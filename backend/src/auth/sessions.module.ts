import { Module } from '@nestjs/common';
import { SessionsRepository } from './sessions.repository.js';

/** Sign-in sessions storage, without the rest of auth: the worker cleans them up. */
@Module({
  providers: [SessionsRepository],
  exports: [SessionsRepository],
})
export class SessionsModule {}
