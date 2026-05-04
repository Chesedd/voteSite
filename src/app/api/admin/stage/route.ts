/**
 * POST /api/admin/stage — change the active session's stage.
 *
 * Body: { to: 'STAGE1' | 'STAGE2' | 'FINISHED' }
 * Success: 200 { ok: true, data: { stage } }
 * Errors:
 *   400 INVALID_INPUT             — body fails Zod validation / malformed JSON
 *   400 INVALID_STAGE_TRANSITION  — pair is not in the allowed transition table
 *   400 STAGE_PREREQUISITES_NOT_MET — pair allowed but data prerequisites unmet
 *   401 UNAUTHORIZED              — no admin auth
 *   403 FORBIDDEN                 — non-admin actor
 *   404 NOT_FOUND                 — no active session
 *
 * Why not assertStage: assertStage is for "operation X requires stage Y".
 * This endpoint *is* the stage-change operation; the right primitive is
 * canTransition + checkTransitionRequirements (see CLAUDE.md "Stage gating"
 * and src/lib/stage-transitions.ts).
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { requireAdmin } from '@/lib/auth/guards'
import { getActiveSession, updateSessionStage } from '@/db/repos/session'
import { getStageStats } from '@/db/repos/track'
import { canTransition, checkTransitionRequirements } from '@/lib/stage-transitions'

const BodySchema = z
  .object({
    to: z.enum(['STAGE1', 'STAGE2', 'FINISHED']),
  })
  .strict()

export async function POST(req: Request): Promise<Response> {
  try {
    const admin = await requireAdmin()

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

    const session = await getActiveSession()
    if (!session || session.id !== admin.sessionId) {
      return err('NOT_FOUND', 'Сессия не найдена', 404)
    }

    const to = parsed.data.to
    const from = session.stage

    if (!canTransition(from, to)) {
      return err('INVALID_STAGE_TRANSITION', `Невозможный переход ${from}→${to}`, 400)
    }

    const stats = await getStageStats(session.id)
    const check = checkTransitionRequirements(from, to, stats)
    if (!check.ok) {
      return err('STAGE_PREREQUISITES_NOT_MET', check.reasons.join('. '), 400)
    }

    await updateSessionStage(session.id, to)
    return ok({ stage: to })
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
