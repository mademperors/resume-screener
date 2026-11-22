import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CandidatesRepository } from '../candidates/candidates.repository.js';
import { CandidateFlag } from '../candidates/evaluation.types.js';
import { EvaluationsRepository } from '../candidates/evaluations.repository.js';
import type { Job } from '../jobs/job.entity.js';
import { normalizeSkill } from '../jobs/requirements.js';
import type { ScoringConfigVersion } from '../jobs/scoring-config-version.entity.js';
import type { Resume } from '../resumes/resume.entity.js';
import { ResumesRepository } from '../resumes/resumes.repository.js';
import type { PreparedResume, ScoreResult, ScreeningResult } from './stages.js';

export interface EvaluationOutcome {
  resume: Resume;
  job: Job;
  config: ScoringConfigVersion;
  prepared: PreparedResume;
  screening: ScreeningResult;
  score: ScoreResult;
}

/**
 * Saves the outcome of one pipeline run in one transaction: the candidate
 * (created or updated), a new evaluation, and the resume marked Processed.
 */
@Injectable()
export class EvaluationRecorder {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly resumes: ResumesRepository,
    private readonly candidates: CandidatesRepository,
    private readonly evaluations: EvaluationsRepository,
  ) {}

  /** Returns false if the resume was deleted while it was being processed. */
  record(outcome: EvaluationOutcome): Promise<boolean> {
    const { resume, job, config, prepared, screening, score } = outcome;
    const flags = [...score.flags];
    if (
      prepared.manipulationDetected &&
      !flags.includes(CandidateFlag.PossibleManipulation)
    ) {
      flags.push(CandidateFlag.PossibleManipulation);
    }
    const matchScore = roundTo(Math.min(100, Math.max(0, score.matchScore)), 2);
    const experienceYears =
      screening.experienceYears === null
        ? null
        : roundTo(screening.experienceYears, 1);

    return this.db.transaction(async (tx) => {
      if (!(await this.resumes.lockForUpdate(resume.id, tx))) {
        return false;
      }
      const candidate = await this.candidates.saveResult(
        {
          companyId: resume.companyId,
          jobId: resume.jobId,
          resumeId: resume.id,
          fullName: prepared.contacts.fullName,
          email: prepared.contacts.email,
          phone: prepared.contacts.phone,
          location: prepared.contacts.location,
          matchScore,
          experienceYears,
          skills: screening.skills,
          skillsNormalized: [...new Set(screening.skills.map(normalizeSkill))],
          missingSkills: score.missingSkills,
          flags,
          belowThreshold: matchScore < job.minMatchScore,
        },
        tx,
      );
      const evaluation = await this.evaluations.create(
        {
          companyId: resume.companyId,
          candidateId: candidate.id,
          configVersionId: config.id,
          modelName: screening.modelName,
          modelVersion: screening.modelVersion,
          matchScore,
          experienceYears,
          verdicts: screening.verdicts,
          contributions: score.contributions,
          foundSkills: score.foundSkills,
          missingSkills: score.missingSkills,
          flags,
          notes: prepared.manipulationNotes,
        },
        tx,
      );
      await this.candidates.setLatestEvaluation(
        candidate.id,
        evaluation.id,
        tx,
      );
      await this.resumes.markProcessed(resume.id, tx);
      return true;
    });
  }
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
