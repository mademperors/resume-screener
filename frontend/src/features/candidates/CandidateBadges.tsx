import { Badge } from '@/components/ui/badge'
import type { CandidateStatus, CandidateWarning } from '@/types/api'

export function CandidateWarningBadges({ warnings }: { warnings: CandidateWarning[] }) {
  if (warnings.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  return (
    <ul className="flex flex-wrap gap-1" aria-label="Warnings">
      {warnings.map((warning) => (
        <li key={warning}>
          <Badge variant={warning === 'Possible manipulation' ? 'destructive' : 'outline'}>
            {warning}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

const statusVariants: Record<CandidateStatus, 'default' | 'destructive' | 'outline'> = {
  Approved: 'default',
  Rejected: 'destructive',
  Pending: 'outline',
}

export function CandidateStatusBadge({ status }: { status: CandidateStatus }) {
  return <Badge variant={statusVariants[status]}>{status}</Badge>
}
