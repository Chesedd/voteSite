/**
 * GET /api/admin/results/export — CSV download of the current results snapshot.
 *
 * Body is plain `text/csv; charset=utf-8` — not the `{ ok, data }` envelope —
 * because the response is a file download triggered by a `<a download>` link.
 * Errors still use the standard envelope (auth/404 cases) so the admin sees
 * a structured failure if something is wrong with the session.
 *
 * The payload starts with the UTF-8 BOM (`﻿`) so Excel detects encoding
 * correctly and Cyrillic text doesn't render as mojibake.
 *
 * Filename includes the session id and an ISO date so an admin who exports
 * multiple times has unambiguous artifacts on disk.
 */

import { err } from '@/lib/api/responses'
import { requireAdmin } from '@/lib/auth/guards'
import { getActiveSession } from '@/db/repos/session'
import { formatResultsCsv } from '@/lib/csv'
import { getResultsForSession } from '@/lib/results'

const UTF8_BOM = '﻿'

function isoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export async function GET(): Promise<Response> {
  try {
    const admin = await requireAdmin()
    const session = await getActiveSession()
    if (!session || session.id !== admin.sessionId) {
      return err('NOT_FOUND', 'Сессия не найдена', 404)
    }

    const data = await getResultsForSession(session.id)
    const csv = UTF8_BOM + formatResultsCsv({ results: data.results, matrix: data.matrix })
    const filename = `results-${session.id}-${isoDate()}.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
