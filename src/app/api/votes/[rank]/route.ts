/**
 * DELETE /api/votes/:rank — clear the participant's vote at a specific rank.
 *
 * Path: rank ∈ {1, 2, 3}
 * Returns: 200 { ok: true, data: VotesByRank } — the updated state.
 * Errors:
 *   400 INVALID_INPUT — rank not in {1, 2, 3}
 *   400 INVALID_STAGE — voting is STAGE2-only
 *   401 UNAUTHORIZED  — no auth
 *   403 FORBIDDEN     — admin actor
 *   404 NOT_FOUND     — no active session
 *
 * Idempotent: if no vote exists at the given rank, the response is the
 * unchanged state. The full `VotesByRank` shape is returned so the client
 * doesn't need a follow-up GET.
 */

import { err, ok } from '@/lib/api/responses'
import { requireParticipant } from '@/lib/auth/guards'
import { StageMismatchError, assertStage } from '@/lib/stage'
import { getActiveSession } from '@/db/repos/session'
import { removeVoteAtRank } from '@/db/repos/vote'

type RouteContext = { params: Promise<{ rank: string }> }

function parseRank(raw: string): 1 | 2 | 3 | null {
  if (raw === '1') return 1
  if (raw === '2') return 2
  if (raw === '3') return 3
  return null
}

export async function DELETE(_req: Request, ctx: RouteContext): Promise<Response> {
  try {
    const participant = await requireParticipant()

    const session = await getActiveSession()
    if (!session) {
      return err('NOT_FOUND', 'Активная сессия не найдена', 404)
    }
    assertStage(session, 'STAGE2')

    const { rank: rawRank } = await ctx.params
    const rank = parseRank(rawRank)
    if (rank === null) {
      return err('INVALID_INPUT', 'Ранг должен быть 1, 2 или 3', 400)
    }

    const data = await removeVoteAtRank({
      participantId: participant.participantId,
      rank,
    })
    return ok(data)
  } catch (e) {
    if (e instanceof Response) return e
    if (e instanceof StageMismatchError) {
      return err('INVALID_STAGE', `Это действие недоступно на этапе ${e.actual}.`, 400)
    }
    throw e
  }
}
