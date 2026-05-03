/**
 * Used by the not-yet-implemented /admin/{participants,tracks,votes,results}
 * pages so sidebar links resolve to friendly placeholder content instead of a
 * 404 while those tickets are still queued.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function PlaceholderSection({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {title} — раздел в разработке.
      </CardContent>
    </Card>
  )
}
