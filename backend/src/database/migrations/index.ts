import { InitialAuthSchema1795119013731 } from './1795119013731-InitialAuthSchema.js';
import { JobsResumesCandidates1795119225025 } from './1795119225025-JobsResumesCandidates.js';
import { ResumeRetryableFailure1795120281493 } from './1795120281493-ResumeRetryableFailure.js';
import { EvaluationNotesPendingDeletions1795122813933 } from './1795122813933-EvaluationNotesPendingDeletions.js';

/** Every migration, in order. Add newly generated migrations here. */
export const MIGRATIONS: Function[] = [
  InitialAuthSchema1795119013731,
  JobsResumesCandidates1795119225025,
  ResumeRetryableFailure1795120281493,
  EvaluationNotesPendingDeletions1795122813933,
];
