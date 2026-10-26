export interface ScreeningFilters {
  /** 0–100. Candidates below this index are considered not matching. */
  minMatchIndex: number
  /** Required skills that must be present in a candidate's profile. */
  mandatorySkills: string[]
}

export interface Job {
  id: string
  title: string
  description: string
  requiredSkills: string[]
  desiredSkills: string[]
  minExperienceYears: number
  filters: ScreeningFilters
  createdAt: string
  updatedAt: string
}

export interface JobInput {
  title: string
  description: string
  requiredSkills: string[]
  desiredSkills: string[]
  minExperienceYears: number
  filters: ScreeningFilters
}

export interface UpdateJobInput extends JobInput {
  /** Ask the backend to re-score candidates already attached to the job. */
  reevaluateCandidates?: boolean
}
