/**
 * Reusable card for displaying a single track in the participant UI.
 *
 * Used in both the "Мои треки" (with edit/delete dropdown) and "Все треки"
 * lists across stages. Layout: cover thumbnail at top-left for list scanning,
 * metadata block (title/artist/service/description) to its right, embed
 * (iframe player or "Открыть" fallback) below, and an optional `bottomActions`
 * slot for stage-specific controls.
 *
 * Why a single `bottomActions` slot rather than baked-in actions? STAGE1 own
 * tracks need an edit/delete menu; STAGE2 needs a rank selector; FINISHED
 * needs nothing. The two responsibilities never overlap on the same card,
 * so one parent-supplied slot keeps this component free of stage logic and
 * lets STAGE2 re-use it via `<TrackRankSelector>`.
 *
 * The thumbnail and the embed cover are intentionally not deduplicated —
 * the thumbnail is for list scanning and the embed renders its own
 * service-native artwork sized for listening.
 *
 * The cover image is rendered with a plain <img> rather than next/image
 * because OG images come from arbitrary external domains (any music service
 * the participant pastes a link to). Configuring next.config.ts
 * remotePatterns for an open-ended set of hosts is more friction than the
 * image optimization buys us at this scale (5–20 participants).
 *
 * Each card sets `id={`track-${track.id}`}` so the STAGE2 top-three panel can
 * scroll-into-view a chosen track via `getElementById`.
 */

'use client'

import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { TrackEmbed } from '@/components/participant/track-embed'
import { cn } from '@/lib/utils'
import type { TrackPublic } from '@/db/repos/track'

const SERVICE_LABELS: Record<string, string> = {
  yandex: 'Яндекс.Музыка',
  spotify: 'Spotify',
  youtube: 'YouTube',
  vk: 'VK',
  apple: 'Apple Music',
  soundcloud: 'SoundCloud',
  other: 'Другой сервис',
}

function serviceLabel(service: string | null): string {
  if (!service) return 'Другой сервис'
  return SERVICE_LABELS[service] ?? 'Другой сервис'
}

export type TrackCardProps = {
  track: TrackPublic
  isOwn?: boolean
  bottomActions?: ReactNode
}

export function TrackCard({ track, isOwn = false, bottomActions }: TrackCardProps) {
  return (
    <Card
      id={`track-${track.id}`}
      className={cn('scroll-mt-24 gap-0 py-0', isOwn && 'ring-primary/40 ring-1 ring-offset-0')}
    >
      <CardContent className="flex gap-4 p-4">
        {track.coverUrl ? (
          // Plain <img>: cover URLs come from arbitrary OG sources we can't
          // pre-list in next.config.ts. See file header for rationale.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.coverUrl}
            alt=""
            loading="lazy"
            className="bg-muted h-20 w-20 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex h-20 w-20 shrink-0 items-center justify-center rounded-md text-xs">
            ♪
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="min-w-0">
            <p className="truncate leading-tight font-semibold">{track.title}</p>
            {track.artist ? (
              <p className="text-muted-foreground truncate text-sm">{track.artist}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">{serviceLabel(track.service)}</Badge>
            {track.embedSupported ? (
              <span className="text-emerald-700 dark:text-emerald-400">✓ С плеером</span>
            ) : (
              <span className="text-muted-foreground">ℹ️ Без плеера</span>
            )}
            {isOwn ? (
              <Badge variant="secondary" className="ml-auto">
                Ваш
              </Badge>
            ) : null}
          </div>
          {track.description ? (
            <p className="text-foreground/90 mt-1 line-clamp-3 text-sm whitespace-pre-wrap">
              {track.description}
            </p>
          ) : null}
          <div className="mt-2">
            <TrackEmbed
              service={track.service}
              serviceTrackId={track.serviceTrackId}
              serviceAlbumId={track.serviceAlbumId}
              embedSupported={track.embedSupported}
              url={track.url}
              coverUrl={track.coverUrl}
            />
          </div>
        </div>
      </CardContent>
      {bottomActions ? <div className="border-t px-4 py-3">{bottomActions}</div> : null}
    </Card>
  )
}
