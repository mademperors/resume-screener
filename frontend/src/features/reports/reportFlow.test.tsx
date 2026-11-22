import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

describe('job report', () => {
  it('renders statistics, requirement coverage and top candidates', async () => {
    renderApp('/jobs/job-1/report')

    expect(await screen.findByRole('heading', { name: 'Job report' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Requirement coverage' })).toBeInTheDocument()
    expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThan(0)
    expect(screen.getByText('Score distribution')).toBeInTheDocument()
    expect(screen.getByText('Top candidates')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Print report/ })).toBeInTheDocument()
  })
})
