/**
 * PATCH /api/admin/settings — toggle session-wide settings (admin only).
 *
 * Body: partial `SessionSettings` — currently only `revealResults`.
 * Success: 200 { ok: true, data: { settings } }
 * Errors:  400 INVALID_INPUT | 400 INVALID_STAGE | 401 UNAUTHORIZED |
 *          403 FORBIDDEN | 404 NOT_FOUND
 *
 * Stage gate: FINISHED only. The participant-facing reveal flag is meaningful
 * only after voting has closed; toggling it during STAGE1/STAGE2 would either
 * leak partial counts or be silently ignored. Returning a 400 instead lets the
 * UI hide the control entirely on earlier stages.
 *
 * The handler merges new keys onto the existing JSONB blob (see
 * `updateSessionSettings`) so unrelated future flags survive a partial PATCH.
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { requireAdmin } from '@/lib/auth/guards'
import { assertStage, StageMismatchError } from '@/lib/stage'
import { getActiveSession, updateSessionSettings } from '@/db/repos/session'

const BodySchema = z
  .object({
    revealResults: z.boolean().optional(),
  })
  .strict()

export async function PATCH(req: Request): Promise<Response> {
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

    // `strict()` keeps unknown keys out, but a body of `{}` still parses. The
    // endpoint is meaningful only when at least one toggle is present —
    // otherwise we'd silently no-op and lie back with HTTP 200.
    const patch = parsed.data
    if (Object.keys(patch).length === 0) {
      return err('INVALID_INPUT', 'Нет полей для обновления', 400)
    }

    const session = await getActiveSession()
    if (!session || session.id !== admin.sessionId) {
      return err('NOT_FOUND', 'Сессия не найдена', 404)
    }

    try {
      assertStage(session, 'FINISHED')
    } catch (e) {
      if (e instanceof StageMismatchError) {
        return err('INVALID_STAGE', 'Настройки доступны только после завершения голосования', 400)
      }
      throw e
    }

    const settings = await updateSessionSettings(session.id, patch)
    return ok({ settings })
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
