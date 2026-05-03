/**
 * PATCH /api/admin/session — update mutable fields on the active session.
 *
 * Body: { title?: string }
 * Success: 200 { ok: true, data: { session } }
 * Errors:  400 INVALID_INPUT | 401 UNAUTHORIZED | 403 FORBIDDEN | 404 NOT_FOUND
 *
 * Currently only `title` is mutable. Stage transitions are handled by a
 * dedicated endpoint (P5-01) and settings live behind PATCH /api/admin/settings
 * — keeping each concern on its own URL makes the per-endpoint validation and
 * stage-gating obvious at a glance.
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { requireAdmin } from '@/lib/auth/guards'
import { getActiveSession, updateSessionTitle } from '@/db/repos/session'

const TITLE_MAX = 120

const BodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, `Название не может быть пустым`)
      .max(TITLE_MAX, `Название должно быть не длиннее ${TITLE_MAX} символов`)
      .optional(),
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

    if (parsed.data.title === undefined) {
      return err('INVALID_INPUT', 'Нет полей для обновления', 400)
    }

    const session = await getActiveSession()
    if (!session || session.id !== admin.sessionId) {
      return err('NOT_FOUND', 'Сессия не найдена', 404)
    }

    const updated = await updateSessionTitle(session.id, parsed.data.title)
    return ok({ session: updated })
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
