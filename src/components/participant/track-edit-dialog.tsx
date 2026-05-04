/**
 * Edit dialog for the participant's own track.
 *
 * URL is intentionally NOT editable post-creation — if a user wants a
 * different track they delete this one and add a new one. Editing the URL
 * would invalidate the cached service / serviceTrackId / coverUrl /
 * embedSupported fields, and re-running detection client-side here would
 * duplicate the /api/tracks/preview flow that the submitter already owns.
 * Keeping this dialog title/artist/description-only keeps the form simple.
 */

'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ApiResponse } from '@/lib/api/responses'
import type { TrackPublic } from '@/db/repos/track'

const TITLE_MAX = 120
const ARTIST_MAX = 120
const DESCRIPTION_MAX = 500

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: 'Проверьте введённые данные',
  INVALID_STAGE: 'Сейчас нельзя редактировать треки',
  OWNERSHIP_REQUIRED: 'Это не ваш трек',
  NOT_FOUND: 'Трек не найден',
  UNAUTHORIZED: 'Сессия истекла, войдите снова',
}

const FALLBACK_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.'

function fallbackError(code?: string, message?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (message) return message
  return FALLBACK_ERROR
}

type TrackEditDialogProps = {
  track: TrackPublic
  onClose: () => void
}

export function TrackEditDialog({ track, onClose }: TrackEditDialogProps) {
  const router = useRouter()
  const [title, setTitle] = useState(track.title)
  const [artist, setArtist] = useState(track.artist ?? '')
  const [description, setDescription] = useState(track.description ?? '')
  const [pending, setPending] = useState(false)

  function handleOpenChange(next: boolean) {
    if (pending) return
    if (!next) onClose()
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
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
      const res = await fetch(`/api/tracks/${encodeURIComponent(track.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          artist: artist.trim() || null,
          description: description.trim() || null,
        }),
      })
      const body = (await res.json()) as ApiResponse<TrackPublic>
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(fallbackError(code, message))
        return
      }
      toast.success('Изменения сохранены')
      router.refresh()
      onClose()
    } catch {
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать трек</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-title">Название</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              required
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-artist">Исполнитель</Label>
            <Input
              id="edit-artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              maxLength={ARTIST_MAX}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-description">Описание</Label>
            <Textarea
              id="edit-description"
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
