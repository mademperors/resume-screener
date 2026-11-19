import { Injectable } from '@nestjs/common';
import {
  CandidateFlag,
  type RequirementContribution,
} from '../../candidates/evaluation.types.js';
import {
  ScoringEngine,
  type PreparedResume,
  type ScoreResult,
  type ScoringConfig,
  type ScreeningResult,
} from '../stages.js';

/**
 * The match score, computed by the system rather than the model:
 *
 *   score = 100 × Σ (weight × credit) / Σ weight
 *   credit = confidence if the requirement is met, otherwise 0
 *
 * Each requirement's points are stored, so recruiters see how much it added.
 * Flags:
 * - "Does not meet requirements": the model is confident a mandatory
 *   requirement is not met;
 * - "Needs manual review": the model is unsure about a mandatory requirement;
 * - "Possible manipulation": hidden text or instructions to AI were found.
 */
@Injectable()
export class WeightedScoringEngine extends ScoringEngine {
  score(
    config: ScoringConfig,
    screening: ScreeningResult,
    resume: PreparedResume,
  ): ScoreResult {
    const verdicts = new Map(
      screening.verdicts.map((v) => [v.requirementId, v]),
    );
    const totalWeight = config.requirements.reduce(
      (sum, r) => sum + r.weight,
      0,
    );

    const contributions: RequirementContribution[] = config.requirements.map(
      (requirement) => {
        const verdict = verdicts.get(requirement.id);
        const met = verdict?.met ?? false;
        const confidence = verdict?.confidence ?? 0;
        const maxPoints =
          totalWeight > 0 ? (100 * requirement.weight) / totalWeight : 0;
        return {
          requirementId: requirement.id,
          label: requirement.label,
          mandatory: requirement.mandatory,
          weight: requirement.weight,
          met,
          confidence,
          points: round(met ? maxPoints * confidence : 0),
          maxPoints: round(maxPoints),
        };
      },
    );

    const threshold = config.manualReviewConfidenceThreshold;
    const mandatory = contributions.filter((c) => c.mandatory);
    const flags: CandidateFlag[] = [];
    if (mandatory.some((c) => !c.met && c.confidence >= threshold)) {
      flags.push(CandidateFlag.DoesNotMeetRequirements);
    }
    if (mandatory.some((c) => c.confidence < threshold)) {
      flags.push(CandidateFlag.NeedsManualReview);
    }
    if (resume.manipulationDetected) {
      flags.push(CandidateFlag.PossibleManipulation);
    }

    const skillRequirements = new Set(
      config.requirements.filter((r) => r.kind === 'skill').map((r) => r.id),
    );
    return {
      matchScore: round(
        Math.min(
          100,
          contributions.reduce((sum, c) => sum + c.points, 0),
        ),
      ),
      contributions,
      flags,
      foundSkills: screening.skills,
      missingSkills: contributions
        .filter((c) => skillRequirements.has(c.requirementId) && !c.met)
        .map((c) => c.label),
    };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
