/**
 * Stage helpers.
 *
 * `assertStage` short-circuits a route handler with a 400 INVALID_STAGE response
 * when the active session is not in one of the allowed stages. Endpoints MUST
 * use this helper rather than inlining `if (session.stage !== ...)` checks so
 * the gating stays centralised and consistent — see CLAUDE.md "Conventions".
 *
 * The full transition machine (canTransition, getTransitionRequirements) lands
 * in TICKET-P5-01; this file currently only carries the assertion used at API
 * boundaries.
 */
import type { SessionStage } from '@prisma/client'

import { err } from '@/lib/api/responses'

type WithStage = { stage: SessionStage }

/**
 * Throws a 400 INVALID_STAGE `Response` when `session.stage` is not in
 * `allowedStages`. Otherwise returns void. Mirrors the throw-Response pattern
 * used by `requireAdmin` / `requireParticipant` so the caller stays flat.
 */
export function assertStage(session: WithStage, ...allowedStages: SessionStage[]): void {
  if (allowedStages.length === 0) {
    throw err('INVALID_STAGE', 'Операция недоступна на текущем этапе', 400)
  }
  if (!allowedStages.includes(session.stage)) {
    throw err('INVALID_STAGE', 'Операция недоступна на текущем этапе', 400)
  }
}
