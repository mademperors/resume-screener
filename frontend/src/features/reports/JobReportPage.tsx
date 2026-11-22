import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
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
import { formatDateTime, formatPercent, formatScore } from '@/lib/format'
import type { JobReport } from '@/types/api'
import { useJobContext } from '@/features/jobs/JobLayout'
import { getJobReport } from './api'

type ReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: JobReport }

export function JobReportPage() {
  const { job } = useJobContext()
  const [state, setState] = useState<ReportState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    getJobReport(job.id)
      .then((report) => {
        if (active) setState({ status: 'ready', report })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to build the report',
          })
        }
      })

    return () => {
      active = false
    }
  }, [job.id, reloadKey])

  if (state.status === 'loading') return <LoadingState label="Building report…" />
  if (state.status === 'error') {
    return <ErrorState message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />
  }

  const report = state.report
  const distributionMax = Math.max(1, ...report.candidates.scoreDistribution.map((b) => b.count))

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Job report</h2>
          <p className="text-sm text-muted-foreground">
            {report.job.title} · generated {formatDateTime(report.generatedAt)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          Print report
        </Button>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle>{report.job.title}</CardTitle>
          <CardDescription>
            Minimum match score {report.job.minMatchScore} · {report.job.minExperienceYears}+ years
            experience · Scoring config v{report.job.configVersion}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="whitespace-pre-line">{report.job.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {report.job.requiredSkills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
            {report.job.preferredSkills.map((skill) => (
              <Badge key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Candidates', value: report.candidates.total },
          { label: 'Above threshold', value: report.candidates.aboveThreshold },
          { label: 'Below threshold', value: report.candidates.belowThreshold },
          { label: 'With warnings', value: report.candidates.withWarnings },
        ].map((stat) => (
          <Card key={stat.label} className="print:border print:shadow-none">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="print:border print:shadow-none">
          <CardHeader>
            <CardTitle>Processing</CardTitle>
            <CardDescription>{report.processing.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Total resumes</p>
              <p className="text-lg font-semibold tabular-nums">{report.processing.total}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Processed</p>
              <p className="text-lg font-semibold tabular-nums">{report.processing.processed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Failed</p>
              <p className="text-lg font-semibold tabular-nums">{report.processing.failed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Average score</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatScore(report.candidates.averageScore)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="print:border print:shadow-none">
          <CardHeader>
            <CardTitle>Decisions</CardTitle>
            <CardDescription>Recruiter decisions across all candidates.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            {(['Pending', 'Approved', 'Rejected'] as const).map((status) => (
              <div key={status}>
                <p className="text-muted-foreground">{status}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {report.candidates.byDecision[status]}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {report.candidates.scoreDistribution.length > 0 ? (
        <Card className="print:border print:shadow-none">
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
            <CardDescription>Number of candidates per score range.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.candidates.scoreDistribution.map((bucket) => (
              <div key={`${bucket.from}-${bucket.to}`} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {bucket.from}–{bucket.to}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(bucket.count / distributionMax) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right tabular-nums">{bucket.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="print:border print:shadow-none">
        <CardHeader>
          <CardTitle>Requirement coverage</CardTitle>
          <CardDescription>How many evaluated candidates meet each requirement.</CardDescription>
        </CardHeader>
        <CardContent>
          {report.requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requirements configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Met</TableHead>
                  <TableHead>Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.requirements.map((requirement) => (
                  <TableRow key={requirement.requirementId}>
                    <TableCell className="font-medium">{requirement.label}</TableCell>
                    <TableCell>
                      <Badge variant={requirement.mandatory ? 'default' : 'outline'}>
                        {requirement.mandatory ? 'Required' : 'Preferred'}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{requirement.met}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatPercent(requirement.share)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="print:border print:shadow-none">
        <CardHeader>
          <CardTitle>Top candidates</CardTitle>
          <CardDescription>Best candidates at or above the minimum score.</CardDescription>
        </CardHeader>
        <CardContent>
          {report.topCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No candidates to show yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Match score</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topCandidates.map((candidate, index) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="tabular-nums">{index + 1}</TableCell>
                    <TableCell className="font-medium">
                      {candidate.name ?? 'Unnamed candidate'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatScore(candidate.matchScore)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {candidate.experienceYears === null
                        ? '—'
                        : `${candidate.experienceYears} yrs`}
                    </TableCell>
                    <TableCell>{candidate.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
