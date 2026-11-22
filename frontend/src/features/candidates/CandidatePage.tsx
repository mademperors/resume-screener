import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorState, LoadingState } from '@/components/PageState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBytes, formatDateTime, formatPercent, formatScore } from '@/lib/format'
import type { CandidateDetail, CandidateStatus, Job, RequirementResult } from '@/types/api'
import { useJob } from '@/features/jobs/useJob'
import { CandidateStatusBadge, CandidateWarningBadges } from './CandidateBadges'
import { deleteCandidate, getCandidate, getResumeFileLink, updateCandidateStatus } from './api'

type CandidateState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; candidate: CandidateDetail }

const statuses: CandidateStatus[] = ['Pending', 'Approved', 'Rejected']

function RequirementRow({ requirement }: { requirement: RequirementResult }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{requirement.label}</TableCell>
      <TableCell>
        <Badge variant={requirement.mandatory ? 'default' : 'outline'}>
          {requirement.mandatory ? 'Required' : 'Preferred'}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={requirement.met ? 'secondary' : 'outline'}>
          {requirement.met ? 'Met' : 'Not met'}
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums">{formatPercent(requirement.confidence)}</TableCell>
      <TableCell className="tabular-nums">
        {requirement.points}/{requirement.maxPoints}
      </TableCell>
      <TableCell className="max-w-xs text-muted-foreground">
        {requirement.evidence ?? '—'}
      </TableCell>
    </TableRow>
  )
}

export function CandidatePage() {
  const { jobId, candidateId } = useParams<{ jobId: string; candidateId: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<CandidateState>({ status: 'loading' })
  const { state: jobState } = useJob(jobId)
  const [updating, setUpdating] = useState(false)
  const [opening, setOpening] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!candidateId) {
      setState({ status: 'error', message: 'Candidate not found' })
      return
    }

    let active = true
    setState({ status: 'loading' })

    getCandidate(candidateId)
      .then((candidate) => {
        if (active) setState({ status: 'ready', candidate })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load the candidate',
          })
        }
      })

    return () => {
      active = false
    }
  }, [candidateId])

  const job: Job | null = jobState.status === 'ready' ? jobState.job : null

  const changeStatus = async (status: CandidateStatus) => {
    if (state.status !== 'ready') return
    setUpdating(true)
    try {
      const updated = await updateCandidateStatus(state.candidate.id, status)
      setState({ status: 'ready', candidate: updated })
      toast.success(`Candidate marked ${status}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update the candidate')
    } finally {
      setUpdating(false)
    }
  }

  const openResume = async () => {
    if (state.status !== 'ready') return

    const previewWindow = window.open('about:blank', '_blank')
    if (previewWindow) previewWindow.opener = null

    setOpening(true)
    try {
      const link = await getResumeFileLink(state.candidate.id)
      if (previewWindow) {
        previewWindow.location.href = link.url
      } else {
        window.open(link.url, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      previewWindow?.close()
      toast.error(error instanceof Error ? error.message : 'Unable to open the resume')
    } finally {
      setOpening(false)
    }
  }

  const handleDelete = async () => {
    if (state.status !== 'ready') return
    try {
      await deleteCandidate(state.candidate.id)
      toast.success('Candidate deleted')
      navigate(`/jobs/${jobId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete the candidate')
    }
  }

  if (state.status === 'loading') return <LoadingState label="Loading candidate…" />
  if (state.status === 'error') return <ErrorState message={state.message} />

  const candidate = state.candidate
  const displayName = candidate.contacts.name ?? 'Unnamed candidate'

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link to={`/jobs/${jobId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to {job?.title ?? 'job'}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
            <CandidateStatusBadge status={candidate.status} />
            {candidate.belowThreshold ? <Badge variant="outline">Below threshold</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {candidate.resume.filename} · uploaded {formatDateTime(candidate.resume.uploadedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={openResume} disabled={opening}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {opening ? 'Opening…' : 'View original resume'}
          </Button>
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Match score</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatScore(candidate.matchScore)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {candidate.experienceYears === null
              ? 'Experience not detected'
              : `${candidate.experienceYears} years of experience`}
            {candidate.belowThreshold ? ' · below the job minimum score' : ''}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Decision</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={candidate.status === status ? 'default' : 'outline'}
                  aria-pressed={candidate.status === status}
                  disabled={updating || candidate.status === status}
                  onClick={() => changeStatus(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Decisions are saved for the recruiting team.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Scored with</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {candidate.evaluation ? (
              <>
                <p className="font-medium">
                  {candidate.evaluation.modelName} v{candidate.evaluation.modelVersion}
                </p>
                <p className="text-muted-foreground">
                  Config v{candidate.evaluation.configVersion} ·{' '}
                  {formatDateTime(candidate.evaluation.evaluatedAt)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Evaluation details are not available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>
              Contact details are stored, but never sent to the screening model.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd>
                  {candidate.contacts.email ? (
                    <a className="hover:underline" href={`mailto:${candidate.contacts.email}`}>
                      {candidate.contacts.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{candidate.contacts.phone ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Location</dt>
                <dd>{candidate.contacts.location ?? '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
            <CardDescription>Skills found in the resume and requirements missing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Found</p>
              {candidate.foundSkills.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Found skills">
                  {candidate.foundSkills.map((skill) => (
                    <li key={skill}>
                      <Badge variant="secondary">{skill}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None detected</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Missing</p>
              {candidate.missingSkills.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Missing skills">
                  {candidate.missingSkills.map((skill) => (
                    <li key={skill}>
                      <Badge variant="outline">{skill}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {candidate.warnings.length > 0 ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>Warnings</CardTitle>
            <CardDescription>Reasons this resume needs a closer look.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <CandidateWarningBadges warnings={candidate.warnings} />
            {candidate.warningDetails.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {candidate.warningDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Requirement breakdown</CardTitle>
          <CardDescription>
            How each requirement contributed to the final match score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidate.requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requirement breakdown available.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidate.requirements.map((requirement) => (
                  <RequirementRow key={requirement.requirementId} requirement={requirement} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Resume file</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {candidate.resume.filename} · {formatBytes(candidate.resume.sizeBytes)}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={openResume} disabled={opening}>
            Open file
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this candidate?"
        description="The candidate’s resume, evaluation and decisions will be permanently removed. This action cannot be undone."
        confirmLabel="Delete candidate"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
