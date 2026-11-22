export type CompanyPlan = 'standard' | 'extended'

export interface Company {
  id: string
  name: string
  plan: CompanyPlan
  apiRateLimitPerMinute: number
  customRateLimitPerMinute: number | null
}

export interface Me {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  company: Company
}

export interface AuthTokens {
  tokenType: 'Bearer'
  accessToken: string
  expiresIn: number
  refreshToken: string
}

export interface SkillWeight {
  skill: string
  weight: number
}

export interface ScoringSettings {
  requiredSkillWeight: number
  preferredSkillWeight: number
  experienceWeight: number
  skillWeights: SkillWeight[]
  manualReviewThreshold: number
}

export interface ScoringSettingsInput {
  requiredSkillWeight?: number
  preferredSkillWeight?: number
  experienceWeight?: number
  skillWeights?: SkillWeight[]
  manualReviewThreshold?: number
}

export type JobStatus = 'open' | 'closed'

export interface Job {
  id: string
  title: string
  description: string
  requiredSkills: string[]
  preferredSkills: string[]
  minExperienceYears: number
  minMatchScore: number
  status: JobStatus
  closedAt: string | null
  configVersion: number
  scoring: ScoringSettings
  createdAt: string
  updatedAt: string
}

export interface CreateJobInput {
  title: string
  description: string
  requiredSkills: string[]
  preferredSkills: string[]
  minExperienceYears: number
  minMatchScore?: number
  scoring?: ScoringSettingsInput
}

export type UpdateJobInput = Partial<CreateJobInput>

export interface UpdatedJob extends Job {
  rescoreSuggested: boolean
}

export type ResumeStatus =
  'Queued' | 'Processing' | 'Processed' | 'Processing failed' | 'Could not read file'

export interface Resume {
  id: string
  jobId: string
  filename: string
  sizeBytes: number
  status: ResumeStatus
  attempts: number
  lastError: string | null
  uploadedAt: string
  processedAt: string | null
  candidateId: string | null
}

export interface ResumePage {
  items: Resume[]
  total: number
  page: number
  pageSize: number
}

export type UploadFileStatus = 'accepted' | 'rejected' | 'duplicate'

export interface FileUploadResult {
  filename: string
  status: UploadFileStatus
  resumeId?: string
  duplicateOfResumeId?: string
  reason?: string
}

export interface UploadResult {
  results: FileUploadResult[]
  accepted: number
  rejected: number
  duplicates: number
}

export interface Progress {
  total: number
  queued: number
  processing: number
  processed: number
  failed: number
  processingFailed: number
  couldNotRead: number
  done: boolean
  summary: string
}

export type CandidateWarning =
  'Does not meet requirements' | 'Needs manual review' | 'Possible manipulation'

export type CandidateStatus = 'Pending' | 'Approved' | 'Rejected'

export interface CandidateSummary {
  id: string
  resumeId: string
  name: string | null
  matchScore: number | null
  experienceYears: number | null
  keySkills: string[]
  warnings: CandidateWarning[]
  status: CandidateStatus
  belowThreshold: boolean
  evaluatedAt: string
}

export interface CandidatePage {
  items: CandidateSummary[]
  total: number
  page: number
  pageSize: number
  minMatchScore: number
}

export interface Contacts {
  name: string | null
  email: string | null
  phone: string | null
  location: string | null
}

export interface RequirementResult {
  requirementId: string
  label: string
  mandatory: boolean
  met: boolean
  confidence: number
  points: number
  maxPoints: number
  evidence: string | null
}

export interface EvaluationInfo {
  id: string
  configVersion: number
  modelName: string
  modelVersion: string
  evaluatedAt: string
}

export interface ResumeInfo {
  id: string
  filename: string
  sizeBytes: number
  uploadedAt: string
}

export interface CandidateDetail {
  id: string
  jobId: string
  contacts: Contacts
  matchScore: number | null
  experienceYears: number | null
  belowThreshold: boolean
  foundSkills: string[]
  missingSkills: string[]
  requirements: RequirementResult[]
  warnings: CandidateWarning[]
  warningDetails: string[]
  status: CandidateStatus
  evaluation: EvaluationInfo | null
  resume: ResumeInfo
}

export type CandidateSortField = 'matchScore' | 'name' | 'experience' | 'warnings' | 'status'

export interface CandidateFilters {
  skills?: string[]
  minExperience?: number
  minScore?: number
  hasWarnings?: boolean
  status?: CandidateStatus
  sortBy?: CandidateSortField
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface DecisionCounts {
  Pending: number
  Approved: number
  Rejected: number
}

export interface ScoreBucket {
  from: number
  to: number
  count: number
}

export interface CandidateStats {
  total: number
  aboveThreshold: number
  belowThreshold: number
  withWarnings: number
  averageScore: number | null
  byDecision: DecisionCounts
  scoreDistribution: ScoreBucket[]
}

export interface RequirementCoverage {
  requirementId: string
  label: string
  mandatory: boolean
  met: number
  share: number
}

export interface JobReport {
  job: Job
  generatedAt: string
  processing: Progress
  candidates: CandidateStats
  requirements: RequirementCoverage[]
  topCandidates: CandidateSummary[]
}

export interface DownloadLink {
  url: string
  expiresAt: string
}

export interface ApiKey {
  id: string
  name: string
  displayPrefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface CreatedApiKey extends ApiKey {
  key: string
}
