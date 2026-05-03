/**
 * Session repository helpers.
 *
 * Minimal surface for now — only what auth and setup need. Full repo helpers
 * (updateSessionStage, etc.) will land in their own ticket (ROADMAP P1-03).
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

/**
 * Atomically create a Session and its initial Participant rows.
 *
 * Used exclusively by POST /api/setup. The Session is born in STAGE1 — the
 * "no session exists" state is represented by the absence of a Session row,
 * not by an enum value (see ARCHITECTURE.md "Stage Machine"). Returns just
 * the Session; callers that need participants re-fetch.
 *
 * Throws on UNIQUE constraint violation if two access keys happen to collide
 * — astronomically unlikely (32^8 ≈ 1.1e12, N ≤ 30) but the transaction will
 * roll back cleanly and the caller surfaces a 500 to the user.
 */
export async function createSessionWithParticipants(params: {
  title: string
  adminPasswordHash: string
  participantKeyHashes: string[]
}) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        title: params.title,
        adminPasswordHash: params.adminPasswordHash,
        stage: 'STAGE1',
      },
    })
    await tx.participant.createMany({
      data: params.participantKeyHashes.map((hash) => ({
        sessionId: session.id,
        accessKeyHash: hash,
      })),
    })
    return session
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
