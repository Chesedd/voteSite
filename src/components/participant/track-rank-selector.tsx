/**
 * Three rank-buttons (1️⃣ / 2️⃣ / 3️⃣) rendered in a `<TrackCard>` footer
 * during STAGE2 voting.
 *
 * Per-button state for rank N:
 *   - "mine"     — currentRank === N → primary variant, aria-pressed; click
 *                  unranks (toggle off).
 *   - "empty"    — that slot is null → outline variant; click places this
 *                  track at rank N.
 *   - "occupied" — slot N points to a *different* track → outline variant
 *                  with a faded hint and a tooltip "Заменит «<title>»";
 *                  click still works (the API moves the old track off, per
 *                  P6-01 placeVote semantics).
 *
 * `pendingRank` (the rank being mutated *on this card*) shows a spinner on
 * the matching button. `disabled` (true while *any* card has an in-flight
 * request) keeps users from queueing concurrent mutations — the optimistic
 * cache assumes one mutation at a time.
 */

'use client'

import { Loader2Icon } from 'lucide-react'
import { Fragment, useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { TrackPublic } from '@/db/repos/track'
import type { VotesByRank } from '@/db/repos/vote'

const RANK_EMOJIS: Record<1 | 2 | 3, string> = {
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
}
const RANKS = [1, 2, 3] as const

type TrackRankSelectorProps = {
  trackId: string
  currentRank: 1 | 2 | 3 | null
  votes: VotesByRank
  tracks: TrackPublic[]
  onPlace: (rank: 1 | 2 | 3) => void
  onUnrank: () => void
  pendingRank: 1 | 2 | 3 | null
  disabled?: boolean
}

export function TrackRankSelector({
  trackId,
  currentRank,
  votes,
  tracks,
  onPlace,
  onUnrank,
  pendingRank,
  disabled = false,
}: TrackRankSelectorProps) {
  const tracksById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])

  return (
    <TooltipProvider>
      <div role="group" aria-label="Поставить ранг" className="flex flex-wrap items-center gap-2">
        {RANKS.map((rank) => {
          const slot = votes[rank]
          const isMine = currentRank === rank
          const isOccupiedByOther = slot !== null && slot.trackId !== trackId
          const isPending = pendingRank === rank
          const otherTrack = isOccupiedByOther ? tracksById.get(slot.trackId) : undefined

          const button = (
            <Button
              type="button"
              size="sm"
              variant={isMine ? 'default' : 'outline'}
              disabled={disabled}
              aria-pressed={isMine}
              aria-label={
                isMine
                  ? `Снять ${rank}-е место`
                  : isOccupiedByOther
                    ? `Поставить на ${rank}-е место (заменит другой трек)`
                    : `Поставить на ${rank}-е место`
              }
              onClick={() => (isMine ? onUnrank() : onPlace(rank))}
              className={cn(
                'min-w-16 flex-1 sm:flex-initial',
                isOccupiedByOther && !isMine && 'opacity-70',
              )}
            >
              {isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <span aria-hidden className="text-base leading-none">
                  {RANK_EMOJIS[rank]}
                </span>
              )}
              {isOccupiedByOther && !isMine ? (
                <span className="text-muted-foreground text-xs">занято</span>
              ) : null}
            </Button>
          )

          if (isOccupiedByOther && !isMine && otherTrack) {
            return (
              <Tooltip key={rank}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent>Заменит «{otherTrack.title}»</TooltipContent>
              </Tooltip>
            )
          }
          return <Fragment key={rank}>{button}</Fragment>
        })}
      </div>
    </TooltipProvider>
  )
}
