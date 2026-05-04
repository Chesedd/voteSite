/**
 * Reusable card for displaying a single track in the participant UI.
 *
 * Used both for the "Мои треки" list (with edit/delete dropdown) and the
 * "Все треки" pool (read-only). Layout: cover thumbnail at top-left for
 * list scanning, metadata block (title/artist/service/description/footer)
 * to the right, and a TrackEmbed (iframe player or "Открыть" fallback)
 * spanning the full width below.
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
 */

'use client'

import { MoreHorizontalIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' })
const ABSOLUTE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const RELATIVE_THRESHOLDS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['minute', 60],
  ['hour', 60 * 60],
  ['day', 60 * 60 * 24],
]

function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diffSec = (d.getTime() - Date.now()) / 1000
  const absSec = Math.abs(diffSec)

  if (absSec < 60) return 'только что'

  for (const [unit, divisor] of RELATIVE_THRESHOLDS) {
    if (absSec < divisor * 60) {
      const value = Math.round(diffSec / divisor)
      return RELATIVE_FORMATTER.format(value, unit)
    }
  }
  // Older than ~24h — fall back to absolute date.
  return ABSOLUTE_FORMATTER.format(d)
}

export type TrackCardProps = {
  track: TrackPublic
  actions?: 'own' | null
  onEdit?: () => void
  onDelete?: () => void
  isOwn?: boolean
}

export function TrackCard({
  track,
  actions = null,
  onEdit,
  onDelete,
  isOwn = false,
}: TrackCardProps) {
  return (
    <Card className={cn('gap-0 py-0', isOwn && 'ring-primary/40 ring-1 ring-offset-0')}>
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate leading-tight font-semibold">{track.title}</p>
              {track.artist ? (
                <p className="text-muted-foreground truncate text-sm">{track.artist}</p>
              ) : null}
            </div>
            {actions === 'own' && (onEdit || onDelete) ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Действия с треком"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit ? (
                    <DropdownMenuItem onSelect={onEdit}>Редактировать</DropdownMenuItem>
                  ) : null}
                  {onDelete ? (
                    <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                      Удалить
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
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
          <p className="text-muted-foreground mt-2 text-xs">
            Добавил {track.submittedBy.displayName ?? 'участник'} ·{' '}
            {formatRelative(track.createdAt)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
