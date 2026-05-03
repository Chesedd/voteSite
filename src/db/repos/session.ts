/**
 * Session repository — minimal helpers.
 *
 * The full repo layer (createSession, updateSessionStage, ...) is scheduled in
 * roadmap ticket P1-03. This module only exposes what P2-04 (admin login)
 * needs so the auth flow can be unblocked without the rest of P1-03.
 *
 * Per docs/ARCHITECTURE.md "Single active session": there is at most one
 * active Session row. We sort by createdAt desc as a defensive measure in
 * case stale rows from tests or aborted resets remain in the database.
 */

import { prisma } from '@/db/client'

export async function getActiveSession() {
  return prisma.session.findFirst({ orderBy: { createdAt: 'desc' } })
}
