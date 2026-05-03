'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/responses'

type RenameSessionDialogProps = {
  currentTitle: string
}

const MAX_TITLE_LENGTH = 120

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: 'Проверьте введённые данные',
  UNAUTHORIZED: 'Сессия истекла, войдите снова',
  FORBIDDEN: 'Недостаточно прав',
}

const FALLBACK_ERROR = 'Не удалось переименовать. Попробуйте ещё раз.'

export function RenameSessionDialog({ currentTitle }: RenameSessionDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(currentTitle)
  const [pending, setPending] = useState(false)

  function handleOpenChange(next: boolean) {
    if (pending) return
    setOpen(next)
    // Reset to the canonical value whenever the dialog opens or closes so a
    // cancelled edit doesn't bleed into the next attempt.
    if (next) setTitle(currentTitle)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = title.trim()
    if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LENGTH) {
      toast.error(`Название должно быть от 1 до ${MAX_TITLE_LENGTH} символов`)
      return
    }
    if (trimmed === currentTitle) {
      setOpen(false)
      return
    }

    setPending(true)
    try {
      const res = await fetch('/api/admin/session', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      const body = (await res.json()) as ApiResponse<unknown>
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        toast.error(code && ERROR_MESSAGES[code] ? ERROR_MESSAGES[code] : FALLBACK_ERROR)
        return
      }
      toast.success('Название обновлено')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Переименовать голосование
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Переименовать голосование</DialogTitle>
          <DialogDescription>
            Название отображается в шапке админки и на страницах участников.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="session-title">Название</Label>
            <Input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              required
              disabled={pending}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
