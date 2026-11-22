import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorState, LoadingState } from '@/components/PageState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { saveBlob } from '@/lib/download'
import { formatScore } from '@/lib/format'
import type {
  CandidateFilters,
  CandidatePage,
  CandidateSortField,
  CandidateStatus,
  CandidateSummary,
} from '@/types/api'
import { useJobContext } from '@/features/jobs/JobLayout'
import { CandidateStatusBadge, CandidateWarningBadges } from './CandidateBadges'
import { exportCandidatesCsv, getCandidates } from './api'

const PAGE_SIZE = 20

interface FilterDraft {
  skills: string
  minExperience: string
  minScore: string
  hasWarnings: boolean
  status: '' | CandidateStatus
}

const emptyDraft: FilterDraft = {
  skills: '',
  minExperience: '',
  minScore: '',
  hasWarnings: false,
  status: '',
}

function parseFilters(params: URLSearchParams) {
  const sortBy = (params.get('sortBy') as CandidateSortField | null) ?? 'matchScore'
  const order = params.get('order') === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)

  const filters: CandidateFilters = {
    sortBy,
    order,
    page,
    pageSize: PAGE_SIZE,
  }

  const skills = (params.get('skills') ?? '')
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
  if (skills.length > 0) filters.skills = skills

  const minExperience = Number(params.get('minExperience'))
  if (params.get('minExperience') && Number.isFinite(minExperience)) {
    filters.minExperience = minExperience
  }

  const minScore = Number(params.get('minScore'))
  if (params.get('minScore') && Number.isFinite(minScore)) {
    filters.minScore = minScore
  }

  if (params.get('hasWarnings') === '1') filters.hasWarnings = true

  const status = params.get('status')
  if (status === 'Pending' || status === 'Approved' || status === 'Rejected') {
    filters.status = status
  }

  return filters
}

function draftFromFilters(filters: CandidateFilters): FilterDraft {
  return {
    skills: (filters.skills ?? []).join(', '),
    minExperience: filters.minExperience !== undefined ? String(filters.minExperience) : '',
    minScore: filters.minScore !== undefined ? String(filters.minScore) : '',
    hasWarnings: filters.hasWarnings === true,
    status: filters.status ?? '',
  }
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: CandidatePage }

const sortColumns: Array<{ field: CandidateSortField; label: string }> = [
  { field: 'name', label: 'Candidate' },
  { field: 'matchScore', label: 'Match score' },
  { field: 'experience', label: 'Experience' },
  { field: 'warnings', label: 'Warnings' },
  { field: 'status', label: 'Status' },
]

function CandidateRows({ candidates, jobId }: { candidates: CandidateSummary[]; jobId: string }) {
  return candidates.map((candidate) => (
    <TableRow key={candidate.id}>
      <TableCell className="font-medium">
        <Link to={`/jobs/${jobId}/candidates/${candidate.id}`} className="hover:underline">
          {candidate.name ?? 'Unnamed candidate'}
        </Link>
      </TableCell>
      <TableCell>
        <span className="font-semibold tabular-nums">{formatScore(candidate.matchScore)}</span>
      </TableCell>
      <TableCell className="tabular-nums">
        {candidate.experienceYears === null ? '—' : `${candidate.experienceYears} yrs`}
      </TableCell>
      <TableCell>
        <CandidateWarningBadges warnings={candidate.warnings} />
      </TableCell>
      <TableCell>
        <CandidateStatusBadge status={candidate.status} />
      </TableCell>
    </TableRow>
  ))
}

export function JobCandidatesPage() {
  const { job } = useJobContext()
  const [params, setParams] = useSearchParams()
  const paramsKey = params.toString()
  const filters = useMemo(() => parseFilters(new URLSearchParams(paramsKey)), [paramsKey])
  const [draft, setDraft] = useState<FilterDraft>(() => draftFromFilters(filters))
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setDraft(draftFromFilters(parseFilters(new URLSearchParams(paramsKey))))
  }, [paramsKey])

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    getCandidates(job.id, filters)
      .then((page) => {
        if (active) setState({ status: 'ready', page })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load candidates',
          })
        }
      })

    return () => {
      active = false
    }
  }, [job.id, filters, reloadKey])

  const updateParams = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next)
  }

  const applyFilters = () => {
    const next = new URLSearchParams()
    const skills = draft.skills
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)

    if (skills.length > 0) next.set('skills', skills.join(','))
    if (draft.minExperience !== '') next.set('minExperience', draft.minExperience)
    if (draft.minScore !== '') next.set('minScore', draft.minScore)
    if (draft.hasWarnings) next.set('hasWarnings', '1')
    if (draft.status) next.set('status', draft.status)
    if (filters.sortBy !== 'matchScore') next.set('sortBy', filters.sortBy ?? 'matchScore')
    if (filters.order !== 'desc') next.set('order', filters.order ?? 'desc')

    setParams(next)
  }

  const resetFilters = () => {
    setDraft(emptyDraft)
    setParams(new URLSearchParams())
  }

  const toggleSort = (field: CandidateSortField) => {
    const nextOrder = filters.sortBy === field && filters.order === 'desc' ? 'asc' : 'desc'
    updateParams({ sortBy: field, order: nextOrder, page: 1 })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const { blob, filename } = await exportCandidatesCsv(job.id, filters)
      saveBlob(blob, filename ?? `candidates-${job.id}.csv`)
      toast.success('CSV export downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to export candidates')
    } finally {
      setExporting(false)
    }
  }

  const total = state.status === 'ready' ? state.page.total : 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rows = state.status === 'ready' ? state.page.items : []
  const above = rows.filter((candidate) => !candidate.belowThreshold)
  const below = rows.filter((candidate) => candidate.belowThreshold)

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-6">
          <search aria-label="Candidate filters">
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                applyFilters()
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label htmlFor="filter-skills">Skills</Label>
                  <Input
                    id="filter-skills"
                    placeholder="e.g. React, TypeScript"
                    value={draft.skills}
                    onChange={(event) => setDraft({ ...draft, skills: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-min-experience">Min experience (yrs)</Label>
                  <Input
                    id="filter-min-experience"
                    type="number"
                    min={0}
                    placeholder="Any"
                    value={draft.minExperience}
                    onChange={(event) => setDraft({ ...draft, minExperience: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-min-score">Min score</Label>
                  <Input
                    id="filter-min-score"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Any"
                    value={draft.minScore}
                    onChange={(event) => setDraft({ ...draft, minScore: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-status">Decision</Label>
                  <Select
                    id="filter-status"
                    value={draft.status}
                    onChange={(event) =>
                      setDraft({ ...draft, status: event.target.value as FilterDraft['status'] })
                    }
                  >
                    <option value="">Any</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex h-9 items-center gap-2 text-sm" htmlFor="filter-warnings">
                    <input
                      id="filter-warnings"
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={draft.hasWarnings}
                      onChange={(event) =>
                        setDraft({ ...draft, hasWarnings: event.target.checked })
                      }
                    />
                    Has warnings
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    Apply filters
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={resetFilters}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reset
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleExport}
                  disabled={exporting || total === 0}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </Button>
              </div>
            </form>
          </search>
        </CardContent>
      </Card>

      {state.status === 'loading' ? <LoadingState label="Loading candidates…" /> : null}
      {state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}

      {state.status === 'ready' && rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 pt-6">
            <h2 className="text-lg font-semibold">No candidates found</h2>
            <p className="text-sm text-muted-foreground">
              Try changing the filters, or upload resumes on the Resumes tab.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={resetFilters}>
              Reset filters
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {state.status === 'ready' && rows.length > 0 ? (
        <>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Candidates</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  {sortColumns.map((column) => (
                    <TableHead key={column.field}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                        onClick={() => toggleSort(column.field)}
                      >
                        {column.label}
                        {filters.sortBy === column.field ? (
                          <span aria-hidden="true">{filters.order === 'desc' ? '↓' : '↑'}</span>
                        ) : null}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <CandidateRows candidates={above} jobId={job.id} />
              </TableBody>
            </Table>
          </div>

          {below.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Below threshold</h2>
              <p className="text-sm text-muted-foreground">
                Candidates scoring below the job minimum of {state.page.minMatchScore}.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    {sortColumns.map((column) => (
                      <TableHead key={column.field}>{column.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <CandidateRows candidates={below} jobId={job.id} />
                </TableBody>
              </Table>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {total} candidate{total === 1 ? '' : 's'} · Page {filters.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={(filters.page ?? 1) <= 1}
                onClick={() => updateParams({ page: (filters.page ?? 1) - 1 })}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={(filters.page ?? 1) >= totalPages}
                onClick={() => updateParams({ page: (filters.page ?? 1) + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
