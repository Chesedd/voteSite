/**
 * /results — participant results page (TICKET-P7-04).
 *
 * Always rendered; the *content* branches by state:
 *   - Not logged in or not a participant → bounce to /login or /admin.
 *   - No active session → /setup.
 *   - Stage != FINISHED → "voting in progress" notice (no redirect).
 *   - revealResults=false → "wait for admin" notice (no redirect).
 *   - Allowed → ranked list + chart.
 *
 * The non-redirect notices are deliberate — a participant who lands here
 * before reveal should see *why* they don't see results, not bounce around.
 *
 * As of Phase 8 the winner is auto-shown on `/` for participants when the
 * session is FINISHED, and there is no UI entry point that links here. This
 * page is kept (along with `GET /api/results` and the `revealResults` flag)
 * for potential future reveal-style UX without a follow-up migration.
 */

import { redirect } from 'next/navigation'

import { ParticipantResultsContent } from '@/components/participant/results-content'
import { getActiveSession } from '@/db/repos/session'
import { getSessionUser } from '@/lib/auth/guards'
import { getResultsForSession } from '@/lib/results'
import { parseSessionSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function ResultsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.kind !== 'participant') redirect('/admin')

  const session = await getActiveSession()
  if (!session) redirect('/setup')
  if (session.id !== user.sessionId) redirect('/login')

  const settings = parseSessionSettings(session.settings)
  const canSeeResults = session.stage === 'FINISHED' && settings.revealResults === true

  // Skip the scoring computation entirely when results aren't viewable —
  // saves a few queries on a cold page load that's about to render a notice.
  const results = canSeeResults ? (await getResultsForSession(session.id)).results : []

  return (
    <ParticipantResultsContent
      initialStage={session.stage}
      initialSettings={settings}
      results={results}
    />
  )
}
