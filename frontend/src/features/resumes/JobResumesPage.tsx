import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, UploadCloud } from 'lucide-react'
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
import { formatBytes, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FileUploadResult, Progress, ResumePage, ResumeStatus } from '@/types/api'
import { useJobContext } from '@/features/jobs/JobLayout'
import { getProgress, getResumes, retryFailedResumes, retryResume, uploadResumes } from './api'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const BATCH_SIZE = 20
const POLL_INTERVAL_MS = 2500

const uploadStatusVariant: Record<
  FileUploadResult['status'],
  'default' | 'destructive' | 'outline'
> = {
  accepted: 'default',
  rejected: 'destructive',
  duplicate: 'outline',
}

const resumeStatusVariant: Record<
  ResumeStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  Queued: 'outline',
  Processing: 'secondary',
  Processed: 'default',
  'Processing failed': 'destructive',
  'Could not read file': 'destructive',
}

function isFailed(status: ResumeStatus) {
  return status === 'Processing failed' || status === 'Could not read file'
}

export function JobResumesPage() {
  const { job } = useJobContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [progress, setProgress] = useState<Progress | null>(null)
  const [progressError, setProgressError] = useState<string | null>(null)
  const [resumes, setResumes] = useState<ResumePage | null>(null)
  const [resumesError, setResumesError] = useState<string | null>(null)
  const [loadingResumes, setLoadingResumes] = useState(true)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [results, setResults] = useState<FileUploadResult[]>([])
  const [pendingDuplicates, setPendingDuplicates] = useState<File[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const [pollKey, setPollKey] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoadingResumes(true)
    setResumesError(null)

    getResumes(job.id, { pageSize: 200 })
      .then((page) => {
        if (active) setResumes(page)
      })
      .catch((error: unknown) => {
        if (active) {
          setResumesError(error instanceof Error ? error.message : 'Unable to load resumes')
        }
      })
      .finally(() => {
        if (active) setLoadingResumes(false)
      })

    return () => {
      active = false
    }
  }, [job.id, refreshKey])

  useEffect(() => {
    let active = true
    let timer: number | undefined

    const tick = async () => {
      try {
        const next = await getProgress(job.id)
        if (!active) return

        setProgress(next)
        setProgressError(null)

        if (!next.done) {
          timer = window.setTimeout(tick, POLL_INTERVAL_MS)
        } else {
          setRefreshKey((key) => key + 1)
        }
      } catch (error) {
        if (active) {
          setProgressError(
            error instanceof Error ? error.message : 'Unable to load processing progress',
          )
        }
      }
    }

    void tick()

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [job.id, pollKey])

  const uploadInBatches = async (files: File[], onDuplicate: 'skip' | 'keep' = 'skip') => {
    setUploading(true)
    setUploadError(null)
    const duplicateFiles: File[] = []

    try {
      for (let index = 0; index < files.length; index += BATCH_SIZE) {
        const batch = files.slice(index, index + BATCH_SIZE)
        const response = await uploadResumes(job.id, batch, onDuplicate)
        setResults((previous) => [...response.results, ...previous])

        if (onDuplicate === 'skip') {
          const duplicateNames = new Set(
            response.results
              .filter((result) => result.status === 'duplicate')
              .map((result) => result.filename),
          )
          duplicateFiles.push(...batch.filter((file) => duplicateNames.has(file.name)))
        }
      }

      if (duplicateFiles.length > 0) {
        setPendingDuplicates(duplicateFiles)
      }

      setPollKey((key) => key + 1)
      setRefreshKey((key) => key + 1)
      toast.success('Upload finished')
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return

    const rejected: FileUploadResult[] = []
    const accepted: File[] = []

    for (const file of files) {
      const name = file.name.toLowerCase()
      if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
        rejected.push({
          filename: file.name,
          status: 'rejected',
          reason: 'Only PDF and DOCX files are supported.',
        })
      } else if (file.size > MAX_FILE_BYTES) {
        rejected.push({
          filename: file.name,
          status: 'rejected',
          reason: 'File is too large (max 10 MB).',
        })
      } else {
        accepted.push(file)
      }
    }

    if (rejected.length > 0) {
      setResults((previous) => [...rejected, ...previous])
    }
    if (accepted.length > 0) {
      void uploadInBatches(accepted)
    }
  }

  const handleRetry = async (resumeId: string) => {
    setRetrying(true)
    try {
      await retryResume(resumeId)
      toast.success('Resume queued for another attempt')
      setPollKey((key) => key + 1)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to retry the resume')
    } finally {
      setRetrying(false)
    }
  }

  const handleRetryFailed = async () => {
    setRetrying(true)
    try {
      const { queued } = await retryFailedResumes(job.id)
      toast.success(`Queued ${queued} resume${queued === 1 ? '' : 's'} for another attempt`)
      setPollKey((key) => key + 1)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to retry failed resumes')
    } finally {
      setRetrying(false)
    }
  }

  const failedCount = resumes?.items.filter((resume) => isFailed(resume.status)).length ?? 0
  const progressValue = progress
    ? Math.min(progress.processed + progress.failed, progress.total)
    : 0
  const progressPercent =
    progress && progress.total > 0 ? (progressValue / progress.total) * 100 : 0

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Upload resumes</CardTitle>
          <CardDescription>
            PDF or DOCX, up to 10 MB each. Files are processed in the background, up to 20 per
            request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className={cn(
              'rounded-lg border-2 border-dashed border-border px-4 py-8 text-center transition-colors',
              dragging && 'border-primary bg-muted',
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              handleFiles(event.dataTransfer.files)
            }}
          >
            <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">Drag and drop resumes here</p>
            <p className="text-sm text-muted-foreground">or choose files from your computer</p>
            <input
              ref={fileInputRef}
              id="resume-upload"
              type="file"
              multiple
              aria-label="Upload resumes"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) handleFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Choose files'}
            </Button>
          </div>

          {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}

          {results.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Upload results</h3>
              <ul className="space-y-1.5" aria-label="Upload results">
                {results.map((result, index) => (
                  <li
                    key={`${result.filename}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{result.filename}</span>
                    <span className="flex items-center gap-2">
                      {result.reason ? (
                        <span className="text-muted-foreground">{result.reason}</span>
                      ) : null}
                      <Badge variant={uploadStatusVariant[result.status]}>{result.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {progress && progress.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Processing progress</CardTitle>
            <CardDescription>{progress.summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <progress
              className="h-2 w-full overflow-hidden rounded-full"
              value={progressValue}
              max={progress.total}
              aria-label={`Processing progress: ${progressValue} of ${progress.total}`}
            >
              {progressPercent}%
            </progress>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Queued</dt>
                <dd className="text-lg font-semibold tabular-nums">{progress.queued}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Processing</dt>
                <dd className="text-lg font-semibold tabular-nums">{progress.processing}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Processed</dt>
                <dd className="text-lg font-semibold tabular-nums">{progress.processed}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Failed</dt>
                <dd className="text-lg font-semibold tabular-nums">{progress.failed}</dd>
              </div>
            </dl>
            {progress.failed > 0 ? (
              <p className="text-sm text-muted-foreground">
                {progress.processingFailed} processing failed, {progress.couldNotRead} could not be
                read.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {progressError ? <ErrorState message={progressError} /> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Uploaded resumes</CardTitle>
              <CardDescription>
                {resumes ? `${resumes.total} resume${resumes.total === 1 ? '' : 's'}` : 'Loading…'}
              </CardDescription>
            </div>
            {failedCount > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRetryFailed}
                disabled={retrying}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry failed ({failedCount})
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {loadingResumes ? <LoadingState label="Loading resumes…" /> : null}
          {resumesError ? <ErrorState message={resumesError} /> : null}

          {!loadingResumes && !resumesError && resumes && resumes.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No resumes uploaded yet. Upload PDF or DOCX files above to get started.
            </p>
          ) : null}

          {!loadingResumes && !resumesError && resumes && resumes.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumes.items.map((resume) => (
                  <TableRow key={resume.id}>
                    <TableCell className="font-medium">
                      {resume.filename}
                      <span className="block text-xs text-muted-foreground">
                        {formatBytes(resume.sizeBytes)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={resumeStatusVariant[resume.status]}>{resume.status}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{resume.attempts}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(resume.uploadedAt)}
                    </TableCell>
                    <TableCell className="max-w-xs text-sm">
                      {resume.lastError ? (
                        <span className="text-destructive">{resume.lastError}</span>
                      ) : resume.candidateId ? (
                        <Link
                          to={`/jobs/${job.id}/candidates/${resume.candidateId}`}
                          className="hover:underline"
                        >
                          View candidate
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isFailed(resume.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(resume.id)}
                          disabled={retrying}
                        >
                          Retry
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingDuplicates !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDuplicates(null)
        }}
        title="Duplicate resumes"
        description="Some of the selected files were already uploaded to this job. Upload them anyway?"
        confirmLabel="Upload anyway"
        cancelLabel="Skip duplicates"
        onConfirm={() => {
          const files = pendingDuplicates
          setPendingDuplicates(null)
          if (files) void uploadInBatches(files, 'keep')
        }}
      />
    </div>
  )
}
