/**
 * Scoring computation (TICKET-P7-01).
 *
 * Pure transformation from a list of tracks and their votes into ranked
 * results. No I/O, no DB, no React. The function is deterministic — the same
 * inputs always produce the same ordered output, including the tiebreaker
 * cascade (points → 1st-place votes → 2nd-place votes → title alphabetical).
 *
 * Per spec: rank 1 → 3pts, rank 2 → 2pts, rank 3 → 1pt. Tracks with zero
 * votes still appear in the result with points=0. Votes pointing to unknown
 * trackIds are silently ignored (defensive — the DB schema makes this
 * impossible, but the function should not crash if a caller passes a stale
 * snapshot).
 */

export type TrackForScoring = {
  id: string
  title: string
  artist: string | null
  submittedBy: { id: string; displayName: string | null }
}

export type VoteForScoring = {
  participantId: string
  trackId: string
  rank: number
}

export type TrackResult = {
  trackId: string
  title: string
  artist: string | null
  submittedBy: { id: string; displayName: string | null }
  points: number
  voters: number
  perRank: { 1: number; 2: number; 3: number }
}

const POINTS_BY_RANK: Record<number, number> = { 1: 3, 2: 2, 3: 1 }

type Tally = {
  points: number
  voterIds: Set<string>
  perRank: { 1: number; 2: number; 3: number }
}

function emptyTally(): Tally {
  return {
    points: 0,
    voterIds: new Set<string>(),
    perRank: { 1: 0, 2: 0, 3: 0 },
  }
}

function compareResults(a: TrackResult, b: TrackResult): number {
  if (a.points !== b.points) return b.points - a.points
  if (a.perRank[1] !== b.perRank[1]) return b.perRank[1] - a.perRank[1]
  if (a.perRank[2] !== b.perRank[2]) return b.perRank[2] - a.perRank[2]
  return a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' })
}

export function computeResults(tracks: TrackForScoring[], votes: VoteForScoring[]): TrackResult[] {
  const knownTrackIds = new Set(tracks.map((t) => t.id))

  const tallies = new Map<string, Tally>()
  for (const vote of votes) {
    if (!knownTrackIds.has(vote.trackId)) continue
    const points = POINTS_BY_RANK[vote.rank]
    if (points === undefined) continue

    const tally = tallies.get(vote.trackId) ?? emptyTally()
    tally.points += points
    tally.voterIds.add(vote.participantId)
    if (vote.rank === 1 || vote.rank === 2 || vote.rank === 3) {
      tally.perRank[vote.rank] += 1
    }
    tallies.set(vote.trackId, tally)
  }

  const results: TrackResult[] = tracks.map((track) => {
    const tally = tallies.get(track.id) ?? emptyTally()
    return {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      submittedBy: track.submittedBy,
      points: tally.points,
      voters: tally.voterIds.size,
      perRank: { ...tally.perRank },
    }
  })

  return results.sort(compareResults)
}
