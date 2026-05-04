/**
 * Shared results helpers (TICKET-P7-02).
 *
 * `getResultsForSession` is the single source of truth for the admin results
 * dashboard and its CSV export — both the page render and the API endpoint
 * delegate here. It composes:
 *   - `listTracks` / `listAllVotes` / `listParticipants` (DB I/O)
 *   - `computeResults` (pure, from scoring.ts)
 *   - `buildVoterRankMatrix` (pure, defined below)
 *
 * `buildVoterRankMatrix` is split out so it can be unit-tested without DB
 * fixtures. Matrix rows are ordered to match `results` (the ranked output),
 * so the table reads top-to-bottom in the same order as the chart.
 */

import { listParticipants } from '@/db/repos/participant'
import { listTracks } from '@/db/repos/track'
import { listAllVotes } from '@/db/repos/vote'
import {
  computeResults,
  type TrackForScoring,
  type TrackResult,
  type VoteForScoring,
} from '@/lib/scoring'

export type VoterRankMatrixParticipant = {
  id: string
  displayName: string | null
}

export type VoterRankMatrixRow = {
  trackId: string
  title: string
  rankByParticipant: Record<string, 1 | 2 | 3 | null>
}

export type VoterRankMatrix = {
  participants: VoterRankMatrixParticipant[]
  rows: VoterRankMatrixRow[]
}

export type ResultsData = {
  results: TrackResult[]
  matrix: VoterRankMatrix
  meta: { totalParticipants: number; votingParticipants: number }
}

export function buildVoterRankMatrix(
  results: TrackResult[],
  votes: VoteForScoring[],
  participants: VoterRankMatrixParticipant[],
): VoterRankMatrix {
  const participantIds = new Set(participants.map((p) => p.id))

  const rows: VoterRankMatrixRow[] = results.map((r) => {
    const rankByParticipant: Record<string, 1 | 2 | 3 | null> = {}
    for (const p of participants) {
      rankByParticipant[p.id] = null
    }
    return { trackId: r.trackId, title: r.title, rankByParticipant }
  })
  const rowByTrack = new Map(rows.map((row) => [row.trackId, row]))

  for (const vote of votes) {
    if (!participantIds.has(vote.participantId)) continue
    const row = rowByTrack.get(vote.trackId)
    if (!row) continue
    if (vote.rank === 1 || vote.rank === 2 || vote.rank === 3) {
      row.rankByParticipant[vote.participantId] = vote.rank
    }
  }

  return {
    participants: participants.map((p) => ({ id: p.id, displayName: p.displayName })),
    rows,
  }
}

function countDistinctVoters(votes: VoteForScoring[]): number {
  const ids = new Set<string>()
  for (const v of votes) ids.add(v.participantId)
  return ids.size
}

export async function getResultsForSession(sessionId: string): Promise<ResultsData> {
  const [tracks, votes, participants] = await Promise.all([
    listTracks(sessionId),
    listAllVotes(sessionId),
    listParticipants(sessionId),
  ])

  const tracksForScoring: TrackForScoring[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    submittedBy: { id: t.submittedBy.id, displayName: t.submittedBy.displayName },
  }))
  const votesForScoring: VoteForScoring[] = votes.map((v) => ({
    participantId: v.participantId,
    trackId: v.trackId,
    rank: v.rank,
  }))

  const results = computeResults(tracksForScoring, votesForScoring)
  const matrix = buildVoterRankMatrix(
    results,
    votesForScoring,
    participants.map((p) => ({ id: p.id, displayName: p.displayName })),
  )

  return {
    results,
    matrix,
    meta: {
      totalParticipants: participants.length,
      votingParticipants: countDistinctVoters(votesForScoring),
    },
  }
}
