import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 pt-6">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you are looking for does not exist.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Back to jobs</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
