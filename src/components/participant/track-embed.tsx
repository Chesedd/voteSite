/**
 * Inline player for a track. Server-rendered iframe HTML; the component
 * itself does not need browser APIs but is exported as a regular component
 * (no 'use client') so it can be composed inside both server and client
 * track-card variants.
 *
 * Embed URLs are re-derived from `service` + `serviceTrackId` here rather
 * than read from a stored `embedUrl` column. The DB doesn't carry that
 * column today, and even if it did, deriving on render means a logic
 * change in URL construction takes effect immediately for existing rows.
 *
 * Sandbox / `allow` attributes are the minimum each provider needs to
 * actually play audio:
 * - Yandex: needs `allow-scripts` + `allow-same-origin` for its widget
 *   to bootstrap, plus `allow-popups` so the "open in app" link works.
 * - Spotify: needs `encrypted-media` for DRM-wrapped previews.
 * - YouTube: needs `encrypted-media` (DRM) and `picture-in-picture`.
 */
import { Button } from '@/components/ui/button'

const SERVICE_NAMES: Record<string, string> = {
  yandex: 'Яндекс.Музыка',
  spotify: 'Spotify',
  youtube: 'YouTube',
  vk: 'ВКонтакте',
  apple: 'Apple Music',
  soundcloud: 'SoundCloud',
  other: 'Другой сервис',
}

function serviceName(service: string | null): string {
  if (!service) return SERVICE_NAMES.other
  return SERVICE_NAMES[service] ?? SERVICE_NAMES.other
}

export type TrackEmbedProps = {
  service: string | null
  serviceTrackId: string | null
  serviceAlbumId: string | null
  embedSupported: boolean
  url: string | null
  coverUrl: string | null
}

export function TrackEmbed({
  service,
  serviceTrackId,
  serviceAlbumId,
  embedSupported,
  url,
  coverUrl,
}: TrackEmbedProps) {
  if (embedSupported && service && serviceTrackId) {
    return (
      <EmbedIframe
        service={service}
        serviceTrackId={serviceTrackId}
        serviceAlbumId={serviceAlbumId}
      />
    )
  }
  return <EmbedFallback service={service} url={url} coverUrl={coverUrl} />
}

function EmbedIframe({
  service,
  serviceTrackId,
  serviceAlbumId,
}: {
  service: string
  serviceTrackId: string
  serviceAlbumId: string | null
}) {
  // Each provider's widget has its own natural height. Don't try to unify
  // them — Yandex's player is 244px (its official embed size), Spotify's
  // compact card is 80px, and YouTube needs ~200px because it shows video
  // frames.
  if (service === 'yandex') {
    // Mirrors the path-based format from Yandex's "Поделиться → HTML-код"
    // output. The earlier hash-fragment form (/iframe/#track/...) is
    // deprecated and renders "Кажется, мы не попали в ноты".
    const yandexEmbed = serviceAlbumId
      ? `https://music.yandex.ru/iframe/album/${serviceAlbumId}/track/${serviceTrackId}`
      : `https://music.yandex.ru/iframe/track/${serviceTrackId}`
    return (
      <div className="bg-muted overflow-hidden rounded-md">
        <iframe
          title={`${SERVICE_NAMES.yandex} — плеер`}
          src={yandexEmbed}
          width="100%"
          height={244}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups"
          frameBorder={0}
          className="block w-full"
        />
      </div>
    )
  }
  if (service === 'spotify') {
    return (
      <div className="bg-muted overflow-hidden rounded-md">
        <iframe
          title={`${SERVICE_NAMES.spotify} — плеер`}
          src={`https://open.spotify.com/embed/track/${serviceTrackId}`}
          width="100%"
          height={80}
          loading="lazy"
          allow="encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          frameBorder={0}
          className="block w-full"
        />
      </div>
    )
  }
  if (service === 'youtube') {
    return (
      <div className="bg-muted overflow-hidden rounded-md">
        <iframe
          title={`${SERVICE_NAMES.youtube} — плеер`}
          src={`https://www.youtube.com/embed/${serviceTrackId}`}
          width="100%"
          height={200}
          loading="lazy"
          allow="encrypted-media; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          allowFullScreen
          frameBorder={0}
          className="block w-full"
        />
      </div>
    )
  }
  // Unknown service marked embedSupported — shouldn't happen, but degrade
  // gracefully to the fallback rather than rendering a broken iframe.
  return <EmbedFallback service={service} url={null} coverUrl={null} />
}

function EmbedFallback({
  service,
  url,
  coverUrl,
}: {
  service: string | null
  url: string | null
  coverUrl: string | null
}) {
  const label = serviceName(service)
  if (!url && !coverUrl) {
    return (
      <div className="bg-muted text-muted-foreground flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm">
        <span>{label}</span>
        <span className="text-xs">Превью недоступно</span>
      </div>
    )
  }
  return (
    <div className="bg-muted/50 flex items-center gap-3 rounded-md p-2">
      {coverUrl ? (
        // Plain <img>: cover URLs come from arbitrary OG sources we can't
        // pre-list in next.config.ts. Same rationale as track-card.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          className="bg-muted h-20 w-20 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="bg-muted text-muted-foreground flex h-20 w-20 shrink-0 items-center justify-center rounded text-xs">
          ♪
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="text-muted-foreground truncate text-sm">{label}</span>
        {url ? (
          <Button asChild size="sm" variant="secondary">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Открыть
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
