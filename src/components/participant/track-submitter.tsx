/**
 * Two-stage track submission form.
 *
 * Stage A — URL input. The user pastes a link. We POST it to /api/tracks/preview
 * to detect the service and scrape OG metadata.
 *
 * Stage B — review and complete. The user can override the auto-filled title/
 * artist (server only suggests) and add an optional description before
 * confirming. URL is locked at this point — to change it, the user goes back.
 *
 * URL is cached across the back/forward path so a user who accidentally backs
 * out doesn't lose what they typed.
 */

'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { ApiResponse } from '@/lib/api/responses'
import type { TrackPublic } from '@/db/repos/track'

const TITLE_MAX = 120
const ARTIST_MAX = 120
const DESCRIPTION_MAX = 500

type Service = 'yandex' | 'spotify' | 'youtube' | 'vk' | 'apple' | 'soundcloud' | 'other'

const SERVICE_LABELS: Record<Service, string> = {
  yandex: 'Яндекс.Музыка',
  spotify: 'Spotify',
  youtube: 'YouTube',
  vk: 'VK',
  apple: 'Apple Music',
  soundcloud: 'SoundCloud',
  other: 'Другой сервис',
}

type PreviewData = {
  service: Service | null
  serviceTrackId: string | null
  serviceAlbumId: string | null
  embedSupported: boolean
  suggestedTitle: string | null
  suggestedArtist: string | null
  coverUrl: string | null
}

type PreviewResponse = ApiResponse<PreviewData>
type CreateResponse = ApiResponse<TrackPublic>

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: 'Проверьте введённые данные',
  INVALID_STAGE: 'Сейчас нельзя добавлять треки',
  LIMIT_EXCEEDED: 'У вас уже 3 трека. Удалите один, чтобы добавить новый.',
  UNAUTHORIZED: 'Сессия истекла, войдите снова',
  FORBIDDEN: 'Недостаточно прав',
  NOT_FOUND: 'Сессия не найдена',
}

const FALLBACK_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.'

function fallbackError(code?: string, message?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (message) return message
  return FALLBACK_ERROR
}

export function TrackSubmitter() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [description, setDescription] = useState('')
  const [pending, setPending] = useState(false)

  function reset() {
    setUrl('')
    setPreview(null)
    setTitle('')
    setArtist('')
    setDescription('')
  }

  async function handleFindTrack(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = url.trim()
    if (trimmed.length === 0) {
      toast.error('Вставьте ссылку на трек')
      return
    }

    setPending(true)
    try {
      const res = await fetch('/api/tracks/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const body = (await res.json()) as PreviewResponse
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(fallbackError(code, message))
        return
      }
      setPreview(body.data)
      setTitle(body.data.suggestedTitle ?? '')
      setArtist(body.data.suggestedArtist ?? '')
      // Description always starts empty — preview never suggests one.
    } catch {
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  async function handleAddTrack(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!preview) return
    const trimmedTitle = title.trim()
    if (trimmedTitle.length === 0) {
      toast.error('Укажите название трека')
      return
    }
    if (trimmedTitle.length > TITLE_MAX) {
      toast.error(`Название не длиннее ${TITLE_MAX} символов`)
      return
    }
    if (artist.length > ARTIST_MAX) {
      toast.error(`Исполнитель не длиннее ${ARTIST_MAX} символов`)
      return
    }
    if (description.length > DESCRIPTION_MAX) {
      toast.error(`Описание не длиннее ${DESCRIPTION_MAX} символов`)
      return
    }

    setPending(true)
    try {
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          artist: artist.trim() || null,
          url: url.trim(),
          description: description.trim() || null,
          service: preview.service,
          serviceTrackId: preview.serviceTrackId,
          serviceAlbumId: preview.serviceAlbumId,
          coverUrl: preview.coverUrl,
          embedSupported: preview.embedSupported,
        }),
      })
      const body = (await res.json()) as CreateResponse
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(fallbackError(code, message))
        return
      }
      toast.success('Трек добавлен')
      reset()
      router.refresh()
    } catch {
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  if (preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Подтвердите трек</CardTitle>
        </CardHeader>
        <form onSubmit={handleAddTrack} className="flex flex-col gap-6">
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4">
              {preview.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.coverUrl}
                  alt=""
                  loading="lazy"
                  className="bg-muted h-20 w-20 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex h-20 w-20 shrink-0 items-center justify-center rounded-md text-xs">
                  ♪
                </div>
              )}
              <div className="flex min-w-0 flex-col justify-center gap-1.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {SERVICE_LABELS[preview.service ?? 'other'] ?? SERVICE_LABELS.other}
                  </Badge>
                  {preview.embedSupported ? (
                    <span className="text-emerald-700 dark:text-emerald-400">✓ С плеером</span>
                  ) : (
                    <span className="text-muted-foreground">ℹ️ Без плеера</span>
                  )}
                </div>
                <p className="text-muted-foreground truncate text-xs">{url}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="track-title">Название</Label>
              <Input
                id="track-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={TITLE_MAX}
                required
                disabled={pending}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="track-artist">Исполнитель</Label>
              <Input
                id="track-artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                maxLength={ARTIST_MAX}
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="track-description">Описание (по желанию)</Label>
              <Textarea
                id="track-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={DESCRIPTION_MAX}
                placeholder="Почему стоит послушать?"
                disabled={pending}
              />
              <p className="text-muted-foreground text-xs">
                {description.length}/{DESCRIPTION_MAX}
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPreview(null)}
              disabled={pending}
            >
              Назад
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Добавление...' : 'Добавить'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Добавить трек</CardTitle>
      </CardHeader>
      <form onSubmit={handleFindTrack} className="flex flex-col gap-6">
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="track-url">Ссылка на трек</Label>
          <Input
            id="track-url"
            type="url"
            inputMode="url"
            placeholder="https://music.yandex.ru/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={pending}
          />
          <p className="text-muted-foreground text-xs">
            Поддерживаются Яндекс.Музыка, Spotify, YouTube. Для других сервисов будет показана
            только обложка.
          </p>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Поиск...' : 'Найти трек'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
