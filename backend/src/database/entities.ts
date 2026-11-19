import { ApiKey } from '../api-keys/api-key.entity.js';
import { Session } from '../auth/session.entity.js';
import { Candidate } from '../candidates/candidate.entity.js';
import { Evaluation } from '../candidates/evaluation.entity.js';
import { Company } from '../companies/company.entity.js';
import { Job } from '../jobs/job.entity.js';
import { ScoringConfigVersion } from '../jobs/scoring-config-version.entity.js';
import { Resume } from '../resumes/resume.entity.js';
import { User } from '../users/user.entity.js';

/** Every entity, for the app and the migration CLI. Add new entities here. */
export const ENTITIES = [
  Company,
  User,
  Session,
  ApiKey,
  Job,
  ScoringConfigVersion,
  Resume,
  Candidate,
  Evaluation,
];
