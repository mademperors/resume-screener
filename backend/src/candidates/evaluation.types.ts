/** Warnings shown next to a candidate. Values are the texts recruiters see. */
export enum CandidateFlag {
  DoesNotMeetRequirements = 'Does not meet requirements',
  NeedsManualReview = 'Needs manual review',
  PossibleManipulation = 'Possible manipulation',
}

/** The model's verdict on one requirement. */
export interface RequirementVerdict {
  requirementId: string;
  met: boolean;
  /** 0..1 */
  confidence: number;
  /** Short quote or reason from the resume, if the model gives one. */
  evidence?: string | null;
}

/** How much one requirement added to the match score. */
export interface RequirementContribution {
  requirementId: string;
  label: string;
  mandatory: boolean;
  weight: number;
  met: boolean;
  confidence: number;
  /** Points out of 100 this requirement contributed. */
  points: number;
  /** Points it could have contributed if fully met with full confidence. */
  maxPoints: number;
}
