/**
 * Session repository helpers.
 *
 * Minimal surface for now — only what auth needs. Full repo helpers
 * (createSession, updateSessionStage, etc.) will land in their own ticket
 * (ROADMAP P1-03).
 */

import { prisma } from '@/db/client'

/**
 * Returns the single active Session row, or null if none exists.
 *
 * The product is single-active by design (see ARCHITECTURE.md "Single active
 * session") — there is at most one Session row at any time. We still order by
 * `createdAt desc` defensively so leftover rows from tests or aborted resets
 * don't confuse the login flow.
 */
export async function getActiveSession() {
  return prisma.session.findFirst({ orderBy: { createdAt: 'desc' } })
}
