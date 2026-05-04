/**
 * Pure helpers for the admin StageControls component.
 *
 * Lives in a `.ts` (not `.tsx`) sibling so unit tests can import it without
 * paying for React / radix-ui / sonner module resolution. The component file
 * re-exports `getButtonState` for convenience.
 */

import type { SessionStage } from '@prisma/client'

import type { StageStats } from '@/lib/stage-transitions'

export type ButtonState = {
  primaryDisabled: boolean
  /** Per-line tooltip reasons; empty when nothing is failing. */
  primaryReasons: string[]
}

const MIN_TRACKS = 3
const MIN_DISTINCT_SUBMITTERS = 2

/**
 * Derives the primary forward-button state from the current stage and live
 * stats. Only failing requirements are reported — a satisfied requirement is
 * omitted entirely. STAGE2 → FINISHED and FINISHED rollback always return
 * `{ primaryDisabled: false, primaryReasons: [] }`.
 */
export function getButtonState(stage: SessionStage, stats: StageStats): ButtonState {
  if (stage === 'STAGE1') {
    const reasons: string[] = []
    if (stats.trackCount < MIN_TRACKS) {
      reasons.push(`Минимум ${MIN_TRACKS} трека (сейчас ${stats.trackCount})`)
    }
    if (stats.distinctSubmittersCount < MIN_DISTINCT_SUBMITTERS) {
      reasons.push(
        `От минимум ${MIN_DISTINCT_SUBMITTERS} участников (сейчас ${stats.distinctSubmittersCount})`,
      )
    }
    return { primaryDisabled: reasons.length > 0, primaryReasons: reasons }
  }
  return { primaryDisabled: false, primaryReasons: [] }
}
