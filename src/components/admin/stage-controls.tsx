/**
 * Stage transition controls rendered inside the /admin "Действия" card.
 *
 * The pure transition logic is in `src/lib/stage-transitions.ts`. This module
 * is just the UI: per-stage button layout, AlertDialog confirmations, and the
 * POST /api/admin/stage call. The endpoint re-validates everything; the UI
 * disables the primary forward button when prerequisites are unmet purely as
 * an affordance.
 */

'use client'

import type { SessionStage } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getButtonState } from '@/components/admin/stage-controls.helpers'
import type { ApiResponse } from '@/lib/api/responses'
import type { StageStats } from '@/lib/stage-transitions'

export type StageControlsProps = {
  currentStage: SessionStage
  stats: StageStats
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_STAGE_TRANSITION: 'Невозможный переход',
  UNAUTHORIZED: 'Сессия истекла',
  FORBIDDEN: 'Сессия истекла',
}

const FALLBACK_ERROR = 'Что-то пошло не так'

export function StageControls({ currentStage, stats }: StageControlsProps) {
  if (currentStage === 'STAGE1') {
    return <Stage1Controls stats={stats} />
  }
  if (currentStage === 'STAGE2') {
    return <Stage2Controls stats={stats} />
  }
  return <FinishedControls />
}

function Stage1Controls({ stats }: { stats: StageStats }) {
  const { primaryDisabled, primaryReasons } = getButtonState('STAGE1', stats)

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <ConfirmTransition
        to="STAGE2"
        title="Перейти к этапу 2: Голосование?"
        description={
          <>
            Участники больше не смогут добавлять или редактировать треки. Сейчас в пуле{' '}
            {stats.trackCount} треков от {stats.distinctSubmittersCount} участников.
          </>
        }
        confirmLabel="Запустить голосование"
      >
        {/*
         * Radix Tooltip needs a hoverable trigger, but a `disabled` <button>
         * doesn't fire pointer events in some browsers. Wrapping in a span
         * with tabIndex keeps the trigger interactive while the button itself
         * stays semantically disabled.
         */}
        {primaryDisabled ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button type="button" disabled aria-disabled="true">
                    Перейти к голосованию
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="mb-1 font-medium">Чтобы запустить голосование:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {primaryReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button type="button">Перейти к голосованию</Button>
        )}
      </ConfirmTransition>
    </div>
  )
}

function Stage2Controls({ stats }: { stats: StageStats }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <ConfirmTransition
        to="FINISHED"
        title="Завершить голосование?"
        description={
          <>
            Голосование закроется. Участники больше не смогут изменить свой выбор. Уже проголосовало{' '}
            {stats.voteCount} голосов.
          </>
        }
        confirmLabel="Завершить"
      >
        <Button type="button">Завершить голосование</Button>
      </ConfirmTransition>
      <ConfirmTransition
        to="STAGE1"
        title="Вернуться к этапу 1?"
        description={
          <>
            Голоса участников <strong className="font-semibold">сохранятся</strong>, но участники
            снова смогут добавлять и редактировать треки. Если потом вы переключите этап обратно,
            голоса будут видны как есть.
          </>
        }
        confirmLabel="Вернуться к этапу 1"
        destructive
      >
        <Button type="button" variant="outline">
          Вернуть к этапу 1
        </Button>
      </ConfirmTransition>
    </div>
  )
}

function FinishedControls() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <ConfirmTransition
        to="STAGE2"
        title="Открыть голосование снова?"
        description={<>Голоса сохранятся. Участники снова смогут менять свой выбор.</>}
        confirmLabel="Открыть"
        destructive
      >
        <Button type="button" variant="outline">
          Открыть голосование
        </Button>
      </ConfirmTransition>
    </div>
  )
}

type ConfirmTransitionProps = {
  to: SessionStage
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  children: React.ReactElement
}

function ConfirmTransition({
  to,
  title,
  description,
  confirmLabel,
  destructive,
  children,
}: ConfirmTransitionProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      const res = await fetch('/api/admin/stage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      const body = (await res.json()) as ApiResponse<unknown>

      if (res.ok && body.ok) {
        setOpen(false)
        toast.success('Этап переключён')
        router.refresh()
        return
      }

      const code = body.ok === false ? body.error.code : undefined
      const apiMessage = body.ok === false ? body.error.message : undefined

      if (code === 'STAGE_PREREQUISITES_NOT_MET' && apiMessage) {
        // Server's reasons are already in Russian; surface them verbatim.
        toast.error(apiMessage)
      } else if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
        toast.error(ERROR_MESSAGES[code])
        setTimeout(() => router.push('/login'), 600)
      } else if (code && ERROR_MESSAGES[code]) {
        toast.error(ERROR_MESSAGES[code])
      } else {
        toast.error(FALLBACK_ERROR)
      }
      setOpen(false)
    } catch {
      toast.error(FALLBACK_ERROR)
      setOpen(false)
    } finally {
      setPending(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (pending) return
    setOpen(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={(e) => {
              // Prevent Radix from auto-closing the dialog before the request
              // settles; we close it ourselves on success/error.
              e.preventDefault()
              void handleConfirm()
            }}
          >
            {pending ? 'Переключаем…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
