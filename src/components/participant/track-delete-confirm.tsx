/**
 * Confirmation dialog for deleting one of the participant's own tracks.
 *
 * Calls DELETE /api/tracks/:id then refreshes. Cascade behaviour (votes
 * referencing the track) is handled by the database — see
 * prisma/schema.prisma `Vote.trackId` onDelete: Cascade.
 */

'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ApiResponse } from '@/lib/api/responses'
import type { TrackPublic } from '@/db/repos/track'

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_STAGE: 'Сейчас нельзя удалять треки',
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

type TrackDeleteConfirmProps = {
  track: TrackPublic
  onClose: () => void
}

export function TrackDeleteConfirm({ track, onClose }: TrackDeleteConfirmProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  function handleOpenChange(next: boolean) {
    if (pending) return
    if (!next) onClose()
  }

  async function handleConfirm() {
    setPending(true)
    try {
      const res = await fetch(`/api/tracks/${encodeURIComponent(track.id)}`, {
        method: 'DELETE',
      })
      const body = (await res.json()) as ApiResponse<unknown>
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(fallbackError(code, message))
        return
      }
      toast.success('Трек удалён')
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
          <DialogTitle>Удалить трек?</DialogTitle>
          <DialogDescription>
            «{track.title}» будет удалён из пула. Действие необратимо.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={pending}>
            {pending ? 'Удаляем...' : 'Удалить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
