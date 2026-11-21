import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { saveBlob } from '@/lib/download'
import { renderApp } from '@/test/render'

vi.mock('@/lib/download', () => ({ saveBlob: vi.fn() }))

describe('candidate workflows', () => {
  it('shows ranked candidates and a separate below-threshold section', async () => {
    renderApp('/jobs/job-1')

    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.getByText('Bob Smith')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Below threshold' })).toBeInTheDocument()
    expect(screen.getByText('Carol Diaz')).toBeInTheDocument()
    expect(screen.getByText('Dan Lee')).toBeInTheDocument()
    expect(screen.getByText('Possible manipulation')).toBeInTheDocument()
  })

  it('filters candidates and resets filters when none match', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-1')

    await screen.findByText('Alice Johnson')

    await user.selectOptions(screen.getByLabelText('Decision'), 'Approved')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    await waitFor(() => expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument())
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument()

    const minScore = screen.getByLabelText('Min score')
    await user.clear(minScore)
    await user.type(minScore, '100')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(await screen.findByText('No candidates found')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument()
  })

  it('exports the filtered candidates as CSV', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-1')

    await screen.findByText('Alice Johnson')
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1))
    const [blob, filename] = vi.mocked(saveBlob).mock.calls[0] ?? []
    expect(blob).toBeDefined()
    expect((blob as Blob).size).toBeGreaterThan(0)
    expect((blob as Blob).type).toContain('text/csv')
    expect(filename).toBe('candidates-job-1.csv')
  })

  it('opens the candidate card and updates the decision', async () => {
    const user = userEvent.setup()
    renderApp('/jobs/job-1/candidates/candidate-1')

    expect(await screen.findByRole('heading', { name: 'Alice Johnson' })).toBeInTheDocument()
    expect(screen.getByText('Requirement breakdown')).toBeInTheDocument()
    expect(screen.getByText('alice.johnson@example.com')).toBeInTheDocument()
    expect(screen.getByText('MockScreeningModel v0.1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rejected' }))

    expect(await screen.findByText('Candidate marked Rejected')).toBeInTheDocument()
  })
})
