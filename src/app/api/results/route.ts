/**
 * GET /api/results — participant-facing results (TICKET-P7-04).
 *
 * Auth: participant.
 * Success: 200 { ok: true, data: TrackResult[] }
 * Errors:  400 RESULTS_HIDDEN | 401 UNAUTHORIZED | 403 FORBIDDEN | 404 NOT_FOUND
 *
 * Two reveal gates: voting must be FINISHED *and* the admin must have flipped
 * `Session.settings.revealResults`. Either gate failing returns the same code
 * (`RESULTS_HIDDEN`) but with a different message, so the UI can surface the
 * reason without parsing strings.
 *
 * The response is the bare ranked list — no voter matrix, no meta. Participants
 * see the order and points; they don't see who voted how (privacy). The admin
 * dashboard (`/api/admin/results`) is the audit surface.
 */

import { err, ok } from '@/lib/api/responses'
import { requireParticipant } from '@/lib/auth/guards'
import { getActiveSession } from '@/db/repos/session'
import { getResultsForSession } from '@/lib/results'
import { parseSessionSettings } from '@/lib/settings'

export async function GET(): Promise<Response> {
  try {
    const participant = await requireParticipant()

    const session = await getActiveSession()
    if (!session || session.id !== participant.sessionId) {
      return err('NOT_FOUND', 'Сессия не найдена', 404)
    }

    if (session.stage !== 'FINISHED') {
      return err('RESULTS_HIDDEN', 'Результаты будут доступны после завершения голосования', 400)
    }

    const settings = parseSessionSettings(session.settings)
    if (!settings.revealResults) {
      return err('RESULTS_HIDDEN', 'Админ ещё не открыл результаты', 400)
    }

    const data = await getResultsForSession(session.id)
    return ok(data.results)
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
