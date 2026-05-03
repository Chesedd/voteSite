/**
 * Visual indicator of the current session stage.
 *
 * Used in the admin shell header now; will be reused across participant UIs in
 * P5-03. Color mapping is intentionally hand-rolled rather than mapped onto
 * the shadcn Badge variants so the stage colors stay distinct from semantic
 * variants (default/destructive/etc.) used elsewhere.
 */

import type { SessionStage } from '@prisma/client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StageBadgeProps = {
  stage: SessionStage
  size?: 'sm' | 'md'
  className?: string
}

const STAGE_LABELS: Record<SessionStage, string> = {
  STAGE1: 'Этап 1: Сбор треков',
  STAGE2: 'Этап 2: Голосование',
  FINISHED: 'Завершено',
}

const STAGE_CLASSES: Record<SessionStage, string> = {
  STAGE1: 'bg-blue-500/15 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300',
  STAGE2: 'bg-purple-500/15 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300',
  FINISHED: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
}

const SIZE_CLASSES: Record<NonNullable<StageBadgeProps['size']>, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
}

export function StageBadge({ stage, size = 'md', className }: StageBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent', STAGE_CLASSES[stage], SIZE_CLASSES[size], className)}
      aria-label={STAGE_LABELS[stage]}
    >
      {STAGE_LABELS[stage]}
    </Badge>
  )
}
