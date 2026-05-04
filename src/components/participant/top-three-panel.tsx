/**
 * Sticky "Ваш топ-3" panel rendered above the track list during STAGE2.
 *
 * Shows three slots — one per rank — each filled with the currently chosen
 * track or an empty placeholder. When all three are filled, a small "✓
 * Голосование сохранено" indicator appears (votes are persisted on every
 * click; this just confirms the participant has used all three slots).
 *
 * Each filled slot is a button that scrolls the matching `<TrackCard>` into
 * view via `getElementById('track-{id}')`. The card has `scroll-mt-24` so
 * it lands below this sticky panel rather than under it.
 *
 * Sticky behaviour: `sticky top-2` plus `z-20` keeps it above scrolling
 * content. We don't anchor to the global header (the layout's header is not
 * itself sticky), so a small top inset is enough.
 */

'use client'

import { useMemo } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TrackPublic } from '@/db/repos/track'
import type { VotesByRank } from '@/db/repos/vote'

const SLOT_MEDALS = ['🥇', '🥈', '🥉'] as const
const RANKS = [1, 2, 3] as const

type TopThreePanelProps = {
  votes: VotesByRank
  tracks: TrackPublic[]
}

export function TopThreePanel({ votes, tracks }: TopThreePanelProps) {
  const tracksById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const filledCount = RANKS.filter((rank) => votes[rank] !== null).length

  function scrollTo(trackId: string) {
    const el = document.getElementById(`track-${trackId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Card
      className={cn(
        'bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-2 z-20 gap-2 py-3 backdrop-blur',
      )}
      aria-label="Ваш топ-3"
    >
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold tracking-tight">Ваш топ-3</h2>
          <p className="text-muted-foreground text-xs">Можно выбрать 1, 2 или 3 трека</p>
        </div>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {RANKS.map((rank) => {
            const slot = votes[rank]
            const track = slot ? tracksById.get(slot.trackId) : undefined
            const medal = SLOT_MEDALS[rank - 1]
            if (!track) {
              return (
                <li
                  key={rank}
                  className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-sm"
                >
                  <span aria-hidden className="text-base opacity-60">
                    {medal}
                  </span>
                  <span>—</span>
                </li>
              )
            }
            return (
              <li key={rank}>
                <button
                  type="button"
                  onClick={() => scrollTo(track.id)}
                  className="bg-card hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
                  aria-label={`${rank}-е место: ${track.title}. Прокрутить к треку.`}
                >
                  <span aria-hidden className="text-base">
                    {medal}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{track.title}</span>
                    {track.artist ? (
                      <span className="text-muted-foreground block truncate text-xs">
                        {track.artist}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        {filledCount === 3 ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ Голосование сохранено</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
