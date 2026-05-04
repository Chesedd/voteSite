/**
 * Winner screen for FINISHED stage (Phase 8 polish).
 *
 * Auto-shown to participants once the session is FINISHED — no admin reveal
 * toggle, no rank emoji, no points, no submitter info. The first entry in
 * `results` is the winner (the array is already ordered by computeResults).
 * If `results` is empty (no votes were cast), we render a neutral notice.
 *
 * Server Component — no client interactivity needed.
 */

import { TrackEmbed } from '@/components/participant/track-embed'
import type { TrackResult } from '@/lib/scoring'
import type { TrackPublic } from '@/db/repos/track'

type WinnerDisplayProps = {
  results: TrackResult[]
  tracks: TrackPublic[]
}

export function WinnerDisplay({ results, tracks }: WinnerDisplayProps) {
  if (results.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-2 py-16 text-center">
        <p className="text-muted-foreground text-base">Голосование завершено. Голосов не было.</p>
      </div>
    )
  }

  const winner = results[0]
  // TrackResult doesn't carry embed fields, so look them up in the
  // already-fetched tracks list rather than re-querying the DB.
  const trackForEmbed = tracks.find((t) => t.id === winner.trackId)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 py-12 text-center">
      <p className="text-muted-foreground text-xl tracking-wide">Победил</p>
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
          {winner.title}
        </h1>
        {winner.artist ? <p className="text-muted-foreground text-lg">{winner.artist}</p> : null}
      </div>
      {trackForEmbed ? (
        <div className="w-full">
          <TrackEmbed
            service={trackForEmbed.service}
            serviceTrackId={trackForEmbed.serviceTrackId}
            serviceAlbumId={trackForEmbed.serviceAlbumId}
            embedSupported={trackForEmbed.embedSupported}
            url={trackForEmbed.url}
            coverUrl={trackForEmbed.coverUrl}
          />
        </div>
      ) : null}
    </div>
  )
}
