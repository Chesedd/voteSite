/**
 * GET /api/admin/results — admin-facing snapshot of the current scoring state.
 *
 * Available at every stage so the admin can preview placeholder data on
 * STAGE1 (no votes possible yet), partial data on STAGE2, and the final
 * standings on FINISHED. Per the visibility matrix, this endpoint is
 * admin-only — participant-side reveal lives behind /api/results.
 *
 * Returns the same shape that `getResultsForSession` produces (results +
 * voter matrix + meta counts). Page render and CSV export both call into
 * the same helper so the two views never disagree.
 */

import { ok, err } from '@/lib/api/responses'
import { requireAdmin } from '@/lib/auth/guards'
import { getActiveSession } from '@/db/repos/session'
import { getResultsForSession } from '@/lib/results'

export async function GET(): Promise<Response> {
  try {
    const admin = await requireAdmin()
    const session = await getActiveSession()
    if (!session || session.id !== admin.sessionId) {
      return err('NOT_FOUND', 'Сессия не найдена', 404)
    }

    const data = await getResultsForSession(session.id)
    return ok(data)
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
