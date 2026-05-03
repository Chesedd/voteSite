/**
 * /admin home overview: current stage, counts, and quick actions.
 *
 * Server-rendered apart from the rename dialog, which has to be a client
 * island because it owns local form state and triggers a client-side fetch.
 */

import type { Session } from '@prisma/client'

import { RenameSessionDialog } from '@/components/admin/rename-session-dialog'
import { StageBadge } from '@/components/admin/stage-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminOverview } from '@/db/repos/admin'

type AdminHomeContentProps = {
  session: Session
  overview: AdminOverview
}

export function AdminHomeContent({ session, overview }: AdminHomeContentProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Текущий этап</CardTitle>
        </CardHeader>
        <CardContent>
          <StageBadge stage={session.stage} size="md" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Статистика</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4 text-center">
            <Stat label="Участников" value={overview.participants} />
            <Stat label="Треков" value={overview.tracks} />
            <Stat label="Голосов" value={overview.votes} />
          </dl>
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Действия</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <RenameSessionDialog currentTitle={session.title} />
          <Button
            type="button"
            variant="outline"
            disabled
            title="Управление этапами появится позже"
          >
            Перейти к следующему этапу
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
