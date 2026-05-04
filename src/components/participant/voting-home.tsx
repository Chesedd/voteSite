/**
 * STAGE2 voting screen for participants.
 *
 * Layout:
 *   - Header (session title, stage badge, logout) — same as STAGE1.
 *   - <TopThreePanel> — sticky summary of the participant's three slots.
 *   - "Все треки" — every track in the pool, each with a `<TrackRankSelector>`
 *     in the bottom action slot.
 *
 * Vote state (`VotesByRank`) is owned here. Each rank click flows as:
 *   1. Optimistic local update (mirrors server's place/unrank semantics).
 *   2. Fetch PUT/DELETE → server returns the authoritative `VotesByRank`.
 *   3. Replace local state with the server response, OR revert + toast on error.
 *
 * There is no "submit" button — every click is immediately persisted. A
 * `pending` state ({trackId, rank}) blocks concurrent mutations while one is
 * in flight; the local optimistic cache assumes one-at-a-time. Vote counts
 * for *other* participants are deliberately not displayed (visibility
 * matrix, ARCHITECTURE.md).
 */

'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { StageBadge } from '@/components/admin/stage-badge'
import { TopThreePanel } from '@/components/participant/top-three-panel'
import { TrackCard } from '@/components/participant/track-card'
import { TrackRankSelector } from '@/components/participant/track-rank-selector'
import { Button } from '@/components/ui/button'
import type { ApiResponse } from '@/lib/api/responses'
import type { TrackPublic } from '@/db/repos/track'
import type { VotesByRank } from '@/db/repos/vote'

const RANKS = [1, 2, 3] as const

type Rank = 1 | 2 | 3
type VotesResponse = ApiResponse<VotesByRank>

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: 'Проверьте введённые данные',
  INVALID_STAGE: 'Сейчас нельзя голосовать',
  UNAUTHORIZED: 'Сессия истекла, войдите снова',
  FORBIDDEN: 'Недостаточно прав',
  NOT_FOUND: 'Трек не найден',
}
const FALLBACK_ERROR = 'Не удалось обновить голос. Попробуйте ещё раз.'

function pickError(code?: string, message?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (message) return message
  return FALLBACK_ERROR
}

function findCurrentRank(votes: VotesByRank, trackId: string): Rank | null {
  for (const r of RANKS) {
    if (votes[r]?.trackId === trackId) return r
  }
  return null
}

/**
 * Optimistic mirror of the server's placeVote semantics: clear the destination
 * slot AND any prior rank held by this track, then place. See
 * `src/db/repos/vote.ts#placeVote` — order matters there for UNIQUE
 * constraints; here it only matters that both slots are cleared first.
 */
function applyPlace(current: VotesByRank, trackId: string, rank: Rank): VotesByRank {
  const next: VotesByRank = { 1: current[1], 2: current[2], 3: current[3] }
  for (const r of RANKS) {
    if (next[r]?.trackId === trackId) next[r] = null
  }
  next[rank] = { trackId }
  return next
}

function applyUnrank(current: VotesByRank, rank: Rank): VotesByRank {
  return { ...current, [rank]: null }
}

type VotingHomeProps = {
  sessionTitle: string
  currentParticipantId: string
  tracks: TrackPublic[]
  initialVotes: VotesByRank
}

export function VotingHome({
  sessionTitle,
  currentParticipantId,
  tracks,
  initialVotes,
}: VotingHomeProps) {
  const router = useRouter()
  const [votes, setVotes] = useState<VotesByRank>(initialVotes)
  const [pending, setPending] = useState<{ trackId: string; rank: Rank } | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

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

  async function place(trackId: string, rank: Rank) {
    if (pending !== null) return
    const previous = votes
    setVotes(applyPlace(votes, trackId, rank))
    setPending({ trackId, rank })
    try {
      const res = await fetch('/api/votes', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackId, rank }),
      })
      const body = (await res.json()) as VotesResponse
      if (!res.ok || !body.ok) {
        setVotes(previous)
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(pickError(code, message))
        return
      }
      setVotes(body.data)
    } catch {
      setVotes(previous)
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(null)
    }
  }

  async function unrank(trackId: string, rank: Rank) {
    if (pending !== null) return
    const previous = votes
    setVotes(applyUnrank(votes, rank))
    setPending({ trackId, rank })
    try {
      const res = await fetch(`/api/votes/${rank}`, { method: 'DELETE' })
      const body = (await res.json()) as VotesResponse
      if (!res.ok || !body.ok) {
        setVotes(previous)
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(pickError(code, message))
        return
      }
      setVotes(body.data)
    } catch {
      setVotes(previous)
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{sessionTitle}</h1>
          <StageBadge stage="STAGE2" size="sm" />
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

      <TopThreePanel votes={votes} tracks={tracks} />

      <section aria-labelledby="pool-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pool-heading" className="text-lg font-semibold tracking-tight">
            Все треки
          </h2>
          <p className="text-muted-foreground text-sm">{tracks.length}</p>
        </div>
        {tracks.length === 0 ? (
          // Defensive: STAGE1→STAGE2 requires ≥3 tracks, so this branch should
          // be unreachable in practice.
          <p className="text-muted-foreground text-sm">Треков пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tracks.map((t) => {
              const currentRank = findCurrentRank(votes, t.id)
              const pendingForCard = pending?.trackId === t.id ? pending.rank : null
              const disabledForCard = pending !== null && pending.trackId !== t.id
              return (
                <li key={t.id}>
                  <TrackCard
                    track={t}
                    isOwn={t.submittedBy.id === currentParticipantId}
                    bottomActions={
                      <TrackRankSelector
                        trackId={t.id}
                        currentRank={currentRank}
                        votes={votes}
                        tracks={tracks}
                        onPlace={(rank) => void place(t.id, rank)}
                        onUnrank={() => {
                          if (currentRank !== null) void unrank(t.id, currentRank)
                        }}
                        pendingRank={pendingForCard}
                        disabled={disabledForCard}
                      />
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
