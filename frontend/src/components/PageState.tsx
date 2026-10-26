import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <Card>
      <CardContent className="pt-6 text-sm text-muted-foreground">{label}</CardContent>
    </Card>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 pt-6">
        <p className="text-sm text-destructive">{message}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
