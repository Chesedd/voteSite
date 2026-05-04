/**
 * Vote repository helpers.
 *
 * Wraps Prisma access for votes. Each participant ranks up to 3 tracks (rank 1
 * = best, 2, 3). Two UNIQUE indexes guard the model: `(participantId, rank)`
 * (one track per slot) and `(participantId, trackId)` (one rank per track).
 *
 * `placeVote` is the only non-trivial helper: it must clear both the
 * destination slot AND any prior rank held by the incoming track inside one
 * transaction, otherwise either UNIQUE could fire mid-mutation. See
 * ARCHITECTURE.md "API Endpoints → Votes" for the public contract.
 */

import { prisma } from '@/db/client'

/**
 * Public shape returned to participants. Numeric keys (1/2/3) map directly to
 * ranks for client iteration — alternative `{ rank1, rank2, rank3 }` would
 * require renaming on the client. Each slot is either `{ trackId }` or `null`
 * (empty).
 */
export type VotesByRank = {
  1: { trackId: string } | null
  2: { trackId: string } | null
  3: { trackId: string } | null
}

function emptyVotesByRank(): VotesByRank {
  return { 1: null, 2: null, 3: null }
}

export async function getVotesByRankForParticipant(participantId: string): Promise<VotesByRank> {
  const votes = await prisma.vote.findMany({
    where: { participantId },
    select: { rank: true, trackId: true },
  })
  const result = emptyVotesByRank()
  for (const v of votes) {
    if (v.rank === 1 || v.rank === 2 || v.rank === 3) {
      result[v.rank] = { trackId: v.trackId }
    }
  }
  return result
}

/**
 * Place `trackId` at the given rank for the participant. Atomic across three
 * operations:
 *   1. Delete any vote at (participantId, rank) — clears the destination slot.
 *   2. Delete any vote at (participantId, trackId) — moves the track off its
 *      previous rank if any.
 *   3. Insert the new vote.
 *
 * (1) and (2) are no-ops when nothing matches. Both are required: without (1)
 * the new insert collides with the slot UNIQUE; without (2) it collides with
 * the (participantId, trackId) UNIQUE when the track already holds another
 * rank for this participant.
 *
 * Re-fetch happens outside the transaction — fine at this scale.
 */
export async function placeVote(params: {
  participantId: string
  sessionId: string
  trackId: string
  rank: number
}): Promise<VotesByRank> {
  const { participantId, sessionId, trackId, rank } = params
  await prisma.$transaction([
    prisma.vote.deleteMany({ where: { participantId, rank } }),
    prisma.vote.deleteMany({ where: { participantId, trackId } }),
    prisma.vote.create({ data: { participantId, sessionId, trackId, rank } }),
  ])
  return getVotesByRankForParticipant(participantId)
}

export async function removeVoteAtRank(params: {
  participantId: string
  rank: number
}): Promise<VotesByRank> {
  const { participantId, rank } = params
  await prisma.vote.deleteMany({ where: { participantId, rank } })
  return getVotesByRankForParticipant(participantId)
}

/**
 * List every vote in a session. Used by P7 results scoring — included here so
 * the vote repo is feature-complete.
 */
export async function listAllVotes(sessionId: string) {
  return prisma.vote.findMany({
    where: { sessionId },
    select: { participantId: true, trackId: true, rank: true },
  })
}
