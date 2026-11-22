import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render'

// jsdom's FormData cannot be serialized by Node's fetch (undici), so multipart
// uploads are mocked here; the component logic (validation, batching, duplicate
// handling, rendering) is still exercised end to end.
vi.mock('@/features/resumes/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/resumes/api')>()
  const seedNames = new Set([
    'alice-johnson.pdf',
    'bob-smith.pdf',
    'carol-diaz.docx',
    'dan-lee.pdf',
  ])

  return {
    ...actual,
    uploadResumes: vi.fn(
      async (_jobId: string, files: File[], onDuplicate: 'skip' | 'keep' = 'skip') => {
        const results = files.map((file) => {
          if (seedNames.has(file.name) && onDuplicate === 'skip') {
            return {
              filename: file.name,
              status: 'duplicate' as const,
              duplicateOfResumeId: 'resume-2',
              reason: 'A file with this name was already uploaded.',
            }
          }
          return {
            filename: file.name,
            status: 'accepted' as const,
            resumeId: `resume-${crypto.randomUUID()}`,
          }
        })

        return {
          results,
          accepted: results.filter((result) => result.status === 'accepted').length,
          rejected: 0,
          duplicates: results.filter((result) => result.status === 'duplicate').length,
        }
      },
    ),
  }
})

function makeFile(name: string, type = 'application/pdf') {
  return new File(['resume'], name, { type })
}

describe('resume workflows', () => {
  it('shows uploaded resumes and processing progress', async () => {
    renderApp('/jobs/job-1/resumes')

    expect(await screen.findByText('alice-johnson.pdf')).toBeInTheDocument()
    expect(await screen.findByText('Processed 4 of 4')).toBeInTheDocument()
    // The list is fetched again when processing is done; wait for it.
    expect(await screen.findByText('bob-smith.pdf')).toBeInTheDocument()
  })

  it('rejects unsupported and oversized files before uploading', async () => {
    renderApp('/jobs/job-1/resumes')

    await screen.findByText('alice-johnson.pdf')

    // Bypass the input's `accept` filter to simulate a user selecting a file
    // that the OS dialog would normally hide.
    fireEvent.change(screen.getByLabelText('Upload resumes'), {
      target: { files: [makeFile('notes.txt', 'text/plain')] },
    })

    expect(await screen.findByText('notes.txt')).toBeInTheDocument()
    expect(screen.getByText('Only PDF and DOCX files are supported.')).toBeInTheDocument()
  })

  it('uploads a PDF and reports the accepted file', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-1/resumes')

    await screen.findByText('alice-johnson.pdf')

    await user.upload(screen.getByLabelText('Upload resumes'), makeFile('new-resume.pdf'))

    expect(await screen.findByText('Upload finished')).toBeInTheDocument()
    expect(await screen.findByText('new-resume.pdf')).toBeInTheDocument()
  })

  it('offers to upload duplicates anyway', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-1/resumes')

    await screen.findByText('alice-johnson.pdf')

    await user.upload(screen.getByLabelText('Upload resumes'), makeFile('bob-smith.pdf'))

    expect(await screen.findByText('Duplicate resumes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Upload anyway' }))

    await waitFor(() => expect(screen.queryByText('Duplicate resumes')).not.toBeInTheDocument())
  })

  it('retries failed resumes', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-2/resumes')

    expect(await screen.findByText('scanned-cv.pdf')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry failed (1)' }))

    expect(await screen.findByText('Queued 1 resume for another attempt')).toBeInTheDocument()
  })
})
