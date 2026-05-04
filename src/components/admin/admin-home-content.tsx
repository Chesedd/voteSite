/**
 * /admin home overview: current stage, counts, and quick actions.
 *
 * Server-rendered apart from interactive islands (rename dialog, stage
 * controls), which own client-side state for their fetches.
 */

import type { Session } from '@prisma/client'

import { JoinLinkCard } from '@/components/admin/join-link-card'
import { RenameSessionDialog } from '@/components/admin/rename-session-dialog'
import { StageBadge } from '@/components/admin/stage-badge'
import { StageControls } from '@/components/admin/stage-controls'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StageStats } from '@/lib/stage-transitions'

type AdminHomeContentProps = {
  session: Session
  stats: StageStats
}

export function AdminHomeContent({ session, stats }: AdminHomeContentProps) {
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
            <Stat label="Участников" value={stats.participantCount} />
            <Stat label="Треков" value={stats.trackCount} />
            <Stat label="Голосов" value={stats.voteCount} />
          </dl>
        </CardContent>
      </Card>
      <div className="md:col-span-2">
        <JoinLinkCard
          joinToken={session.joinToken}
          maxParticipants={session.maxParticipants}
          registered={stats.participantCount}
          stage={session.stage}
        />
      </div>
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Действия</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Section label="Информация">
            <RenameSessionDialog currentTitle={session.title} />
          </Section>
          <Section label="Этап">
            <StageControls currentStage={session.stage} stats={stats} />
          </Section>
        </CardContent>
      </Card>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs tracking-wide uppercase">{label}</h3>
      {children}
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
