/**
 * Admin-only data access helpers.
 *
 * Aggregations the admin dashboard needs at a glance. Kept separate from the
 * per-entity repos because these queries cross multiple tables and exist only
 * to feed admin UI — they have no callers in the participant flow.
 */

import { prisma } from '@/db/client'

export type AdminOverview = {
  participants: number
  tracks: number
  votes: number
}

export async function getAdminOverview(sessionId: string): Promise<AdminOverview> {
  const [participants, tracks, votes] = await Promise.all([
    prisma.participant.count({ where: { sessionId } }),
    prisma.track.count({ where: { sessionId } }),
    prisma.vote.count({ where: { sessionId } }),
  ])
  return { participants, tracks, votes }
}
