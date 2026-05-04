/**
 * Participant home — the page rendered at `/` for logged-in participants.
 *
 * Dispatches by stage:
 *   - STAGE1: header + "Мой блок" submission form/own tracks + "Все треки".
 *   - STAGE2: delegates to <VotingHome> (sticky top-3 panel + rank selectors).
 *   - FINISHED: header + "Все треки" + "voting closed" notice.
 *
 * Mutations on STAGE1 (create / edit / delete) all flow through
 * `router.refresh()` which re-runs the parent server component and refetches
 * tracks. Simpler than maintaining a parallel client cache for a 5–20 person
 * app. STAGE2 uses optimistic local state — see `<VotingHome>`.
 */

'use client'

import type { SessionStage } from '@prisma/client'
import { MoreHorizontalIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { StageBadge } from '@/components/admin/stage-badge'
import { TrackCard } from '@/components/participant/track-card'
import { TrackDeleteConfirm } from '@/components/participant/track-delete-confirm'
import { TrackEditDialog } from '@/components/participant/track-edit-dialog'
import { TrackSubmitter } from '@/components/participant/track-submitter'
import { VotingHome } from '@/components/participant/voting-home'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TrackPublic } from '@/db/repos/track'
import type { VotesByRank } from '@/db/repos/vote'

const TRACK_LIMIT = 3

type ParticipantHomeProps = {
  sessionTitle: string
  stage: SessionStage
  currentParticipantId: string
  tracks: TrackPublic[]
  initialVotes: VotesByRank | null
}

export function ParticipantHome({
  sessionTitle,
  stage,
  currentParticipantId,
  tracks,
  initialVotes,
}: ParticipantHomeProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<TrackPublic | null>(null)
  const [deleting, setDeleting] = useState<TrackPublic | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  if (stage === 'STAGE2') {
    return (
      <VotingHome
        sessionTitle={sessionTitle}
        currentParticipantId={currentParticipantId}
        tracks={tracks}
        initialVotes={initialVotes ?? { 1: null, 2: null, 3: null }}
      />
    )
  }

  const ownTracks = tracks.filter((t) => t.submittedBy.id === currentParticipantId)
  const ownCount = ownTracks.length
  const limitReached = ownCount >= TRACK_LIMIT

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      toast.error('Не удалось связаться с сервером, выходим локально.')
    } finally {
      router.refresh()
      router.push('/login')
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{sessionTitle}</h1>
          <StageBadge stage={stage} size="sm" />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut}
          className="self-start sm:self-auto"
        >
          {loggingOut ? 'Выходим…' : 'Выйти'}
        </Button>
      </header>

      <section aria-labelledby="my-block-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="my-block-heading" className="text-lg font-semibold tracking-tight">
            Мой блок
          </h2>
          {stage === 'STAGE1' ? (
            <p className="text-muted-foreground text-sm">
              Мои треки ({ownCount}/{TRACK_LIMIT})
            </p>
          ) : null}
        </div>

        {stage === 'STAGE1' ? (
          <>
            {limitReached ? (
              <Alert>
                <AlertTitle>Лимит {TRACK_LIMIT} трека достигнут</AlertTitle>
                <AlertDescription>Удалите один трек, чтобы добавить новый.</AlertDescription>
              </Alert>
            ) : (
              <TrackSubmitter />
            )}
            {ownCount > 0 ? (
              <ul className="flex flex-col gap-3">
                {ownTracks.map((t) => (
                  <li key={t.id}>
                    <TrackCard
                      track={t}
                      isOwn
                      bottomActions={
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="Действия с треком"
                              >
                                <MoreHorizontalIcon />
                                Действия
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(t)}>
                                Редактировать
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeleting(t)}
                              >
                                Удалить
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Вы ещё не добавили ни одного трека.</p>
            )}
          </>
        ) : null}

        {stage === 'FINISHED' ? (
          <Alert>
            <AlertTitle>Голосование завершено</AlertTitle>
            <AlertDescription>Дождитесь, пока админ опубликует результаты.</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section aria-labelledby="pool-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pool-heading" className="text-lg font-semibold tracking-tight">
            Все треки
          </h2>
          <p className="text-muted-foreground text-sm">{tracks.length}</p>
        </div>
        {tracks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Пока пусто. Будьте первым — добавьте свой трек.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tracks.map((t) => (
              <li key={t.id}>
                <TrackCard track={t} isOwn={t.submittedBy.id === currentParticipantId} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? <TrackEditDialog track={editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? <TrackDeleteConfirm track={deleting} onClose={() => setDeleting(null)} /> : null}
    </div>
  )
}
