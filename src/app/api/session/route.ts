/**
 * GET /api/session — current session metadata for the authenticated user.
 *
 * Auth: any authenticated user (admin or participant).
 * Success: 200 { ok: true, data: { id, title, stage, maxParticipants, settings, joinToken? } }
 * Errors:  401 UNAUTHORIZED | 404 NOT_FOUND
 *
 * Used by the participant voting screen to detect stage transitions (so the
 * page can `router.refresh()` when admin advances the stage) and by the
 * participant results page to notice when admin toggles `revealResults`. The
 * `joinToken` is admin-only — see ARCHITECTURE.md "Visibility Matrix":
 * participants don't need it and we'd rather not leak it onto every voting
 * client unnecessarily.
 */

import { err, ok } from '@/lib/api/responses'
import { getSessionUser } from '@/lib/auth/guards'
import { getActiveSession } from '@/db/repos/session'
import { parseSessionSettings } from '@/lib/settings'

export async function GET(): Promise<Response> {
  try {
    const user = await getSessionUser()
    if (!user) return err('UNAUTHORIZED', 'Authentication required', 401)

    const session = await getActiveSession()
    if (!session || session.id !== user.sessionId) {
      return err('NOT_FOUND', 'Активная сессия не найдена', 404)
    }

    const base = {
      id: session.id,
      title: session.title,
      stage: session.stage,
      maxParticipants: session.maxParticipants,
      settings: parseSessionSettings(session.settings),
    }
    if (user.kind === 'admin') {
      return ok({ ...base, joinToken: session.joinToken })
    }
    return ok(base)
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
