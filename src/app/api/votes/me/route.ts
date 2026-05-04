/**
 * GET /api/votes/me — return the authenticated participant's current top-3.
 *
 * Returns: 200 { ok: true, data: VotesByRank } where VotesByRank is
 *   { 1: { trackId } | null, 2: ..., 3: ... }
 * Errors:
 *   400 INVALID_STAGE — voting is STAGE2-only
 *   401 UNAUTHORIZED  — no auth
 *   403 FORBIDDEN     — admin actor
 *   404 NOT_FOUND     — no active session
 *
 * Numeric keys map 1:1 to ranks for client iteration. The alternative
 * `{ rank1, rank2, rank3 }` would force renaming on the client. See
 * ARCHITECTURE.md "API Endpoints → Votes".
 */

import { err, ok } from '@/lib/api/responses'
import { requireParticipant } from '@/lib/auth/guards'
import { StageMismatchError, assertStage } from '@/lib/stage'
import { getActiveSession } from '@/db/repos/session'
import { getVotesByRankForParticipant } from '@/db/repos/vote'

export async function GET(): Promise<Response> {
  try {
    const participant = await requireParticipant()

    const session = await getActiveSession()
    if (!session) {
      return err('NOT_FOUND', 'Активная сессия не найдена', 404)
    }
    assertStage(session, 'STAGE2')

    const data = await getVotesByRankForParticipant(participant.participantId)
    return ok(data)
  } catch (e) {
    if (e instanceof Response) return e
    if (e instanceof StageMismatchError) {
      return err('INVALID_STAGE', `Это действие недоступно на этапе ${e.actual}.`, 400)
    }
    throw e
  }
}
