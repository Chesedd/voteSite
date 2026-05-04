/**
 * Stage transition logic.
 *
 * Pure module — no I/O. The same `canTransition` and
 * `describeTransitionRequirements` are reused by the admin endpoint
 * (`POST /api/admin/stage`) and the admin UI (P5-02) to disable the
 * "next stage" button and feed its tooltip.
 *
 * Why two requirement helpers:
 * - `describeTransitionRequirements(from, to)` returns static descriptions
 *   so the UI can render the requirement copy on a disabled button before
 *   stats have loaded.
 * - `checkTransitionRequirements(from, to, stats)` runs the actual
 *   server-side check against live counts and reports unmet conditions.
 *
 * Rollback semantics: STAGE2 → STAGE1 and FINISHED → STAGE2 are recovery
 * operations. Votes are preserved (frozen) by design — see
 * docs/ARCHITECTURE.md "Stage Machine → Allowed Transitions". No
 * prerequisites are enforced for rollbacks.
 */

import type { SessionStage } from '@prisma/client'

export type TransitionRequirementCheck = {
  ok: boolean
  reasons: string[]
}

export type StageStats = {
  participantCount: number
  trackCount: number
  distinctSubmittersCount: number
  voteCount: number
}

const ALLOWED: Array<[SessionStage, SessionStage]> = [
  ['STAGE1', 'STAGE2'],
  ['STAGE2', 'FINISHED'],
  ['STAGE2', 'STAGE1'],
  ['FINISHED', 'STAGE2'],
]

const ROLLBACKS: Array<[SessionStage, SessionStage]> = [
  ['STAGE2', 'STAGE1'],
  ['FINISHED', 'STAGE2'],
]

const MIN_TRACKS = 3
const MIN_DISTINCT_SUBMITTERS = 2

export function canTransition(from: SessionStage, to: SessionStage): boolean {
  return ALLOWED.some(([f, t]) => f === from && t === to)
}

function isRollback(from: SessionStage, to: SessionStage): boolean {
  return ROLLBACKS.some(([f, t]) => f === from && t === to)
}

export function checkTransitionRequirements(
  from: SessionStage,
  to: SessionStage,
  stats: StageStats,
): TransitionRequirementCheck {
  if (isRollback(from, to)) {
    return { ok: true, reasons: [] }
  }

  const reasons: string[] = []

  if (from === 'STAGE1' && to === 'STAGE2') {
    if (stats.trackCount < MIN_TRACKS) {
      reasons.push(`Нужно хотя бы 3 трека (сейчас ${stats.trackCount})`)
    }
    if (stats.distinctSubmittersCount < MIN_DISTINCT_SUBMITTERS) {
      reasons.push(
        `Треки должны быть от разных участников (сейчас ${stats.distinctSubmittersCount} автор)`,
      )
    }
  }

  return { ok: reasons.length === 0, reasons }
}

export function describeTransitionRequirements(from: SessionStage, to: SessionStage): string[] {
  if (from === 'STAGE1' && to === 'STAGE2') {
    return ['Нужно минимум 3 трека', 'От минимум 2 участников']
  }
  return []
}
