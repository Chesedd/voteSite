/**
 * PUT /api/votes — place a track at a rank for the authenticated participant.
 *
 * Body:    { trackId: string, rank: 1 | 2 | 3 }
 * Returns: 200 { ok: true, data: VotesByRank }
 * Errors:
 *   400 INVALID_INPUT — body fails Zod validation / malformed JSON
 *   400 INVALID_STAGE — voting is STAGE2-only
 *   401 UNAUTHORIZED  — no auth
 *   403 FORBIDDEN     — admin actor
 *   404 NOT_FOUND     — no active session, or track not in session
 *
 * Semantics ("place this track at this rank for me"):
 *   - If a vote already exists at this rank → it is replaced.
 *   - If this trackId already holds a different rank → the old rank is
 *     cleared (a track only ever occupies one rank per participant).
 *   - All three repo operations run inside one transaction so the two UNIQUE
 *     constraints — (participantId, rank) and (participantId, trackId) —
 *     never see a partial state.
 *
 * The full `VotesByRank` shape is re-fetched after the transaction so the
 * client sees the authoritative state (including any rank that was cleared
 * as a side effect of the move). The track's existence and session
 * membership are verified before the transaction.
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { requireParticipant } from '@/lib/auth/guards'
import { StageMismatchError, assertStage } from '@/lib/stage'
import { getActiveSession } from '@/db/repos/session'
import { findTrackSessionId } from '@/db/repos/track'
import { placeVote } from '@/db/repos/vote'

const BodySchema = z
  .object({
    trackId: z.string().trim().min(1),
    rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict()

export async function PUT(req: Request): Promise<Response> {
  try {
    const participant = await requireParticipant()

    const session = await getActiveSession()
    if (!session) {
      return err('NOT_FOUND', 'Активная сессия не найдена', 404)
    }
    assertStage(session, 'STAGE2')

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return err('INVALID_INPUT', 'Некорректный JSON в теле запроса', 400)
    }

    const parsed = BodySchema.safeParse(payload)
    if (!parsed.success) {
      return err('INVALID_INPUT', 'Проверьте введённые данные', 400)
    }

    const { trackId, rank } = parsed.data
    const trackSessionId = await findTrackSessionId(trackId)
    if (!trackSessionId || trackSessionId !== session.id) {
      return err('NOT_FOUND', 'Трек не найден', 404)
    }

    const data = await placeVote({
      participantId: participant.participantId,
      sessionId: session.id,
      trackId,
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
