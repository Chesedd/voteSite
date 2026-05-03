/**
 * Session repository helpers.
 *
 * Minimal surface for now — only what auth and setup need. Full repo helpers
 * (updateSessionStage, etc.) will land in their own ticket (ROADMAP P1-03).
 */

import type { Session } from '@prisma/client'
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

/**
 * Create a Session in STAGE1 with no participants. Participants self-register
 * later via /join/{joinToken} (see ARCHITECTURE.md "Self-Registration Flow").
 *
 * The "no session exists" state is represented by the absence of a Session
 * row, not by an enum value (see ARCHITECTURE.md "Stage Machine").
 */
export async function createSession(params: {
  title: string
  adminPasswordHash: string
  joinToken: string
  maxParticipants: number
}): Promise<Session> {
  return prisma.session.create({
    data: {
      title: params.title,
      adminPasswordHash: params.adminPasswordHash,
      joinToken: params.joinToken,
      maxParticipants: params.maxParticipants,
      stage: 'STAGE1',
    },
  })
}

/**
 * Update a single Session row's title. Throws if no row matches the id —
 * callers should ensure the session exists (typically by calling this only
 * after `requireAdmin` + `getActiveSession`).
 */
export async function updateSessionTitle(sessionId: string, title: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { title },
  })
}
