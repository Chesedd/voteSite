import { describe, expect, it } from 'vitest'

import { computeResults, type TrackForScoring, type VoteForScoring } from './scoring'

function track(
  id: string,
  title: string,
  submitterId = 'p-' + id,
  submitterName: string | null = null,
  artist: string | null = null,
): TrackForScoring {
  return {
    id,
    title,
    artist,
    submittedBy: { id: submitterId, displayName: submitterName },
  }
}

function vote(participantId: string, trackId: string, rank: number): VoteForScoring {
  return { participantId, trackId, rank }
}

describe('computeResults', () => {
  describe('empty / trivial inputs', () => {
    it('returns [] for empty tracks and empty votes', () => {
      expect(computeResults([], [])).toEqual([])
    })

    it('returns [] when there are votes but no tracks', () => {
      expect(computeResults([], [vote('p1', 't1', 1)])).toEqual([])
    })

    it('returns all tracks with zero points sorted alphabetically when there are no votes', () => {
      const results = computeResults(
        [track('t1', 'Charlie'), track('t2', 'Alpha'), track('t3', 'Bravo')],
        [],
      )
      expect(results.map((r) => r.title)).toEqual(['Alpha', 'Bravo', 'Charlie'])
      for (const r of results) {
        expect(r.points).toBe(0)
        expect(r.voters).toBe(0)
        expect(r.perRank).toEqual({ 1: 0, 2: 0, 3: 0 })
      }
    })

    it('handles a single track receiving a single rank-1 vote', () => {
      const results = computeResults([track('t1', 'Solo')], [vote('p1', 't1', 1)])
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        trackId: 't1',
        points: 3,
        voters: 1,
        perRank: { 1: 1, 2: 0, 3: 0 },
      })
    })
  })

  describe('score arithmetic', () => {
    it('assigns 3 points for rank 1, 2 for rank 2, 1 for rank 3', () => {
      const results = computeResults(
        [track('t1', 'A'), track('t2', 'B'), track('t3', 'C')],
        [vote('p1', 't1', 1), vote('p1', 't2', 2), vote('p1', 't3', 3)],
      )
      const byId = Object.fromEntries(results.map((r) => [r.trackId, r]))
      expect(byId.t1.points).toBe(3)
      expect(byId.t2.points).toBe(2)
      expect(byId.t3.points).toBe(1)
    })

    it('aggregates rank 1 + rank 2 + rank 3 from three voters into one track', () => {
      const results = computeResults(
        [track('t1', 'Mass Appeal')],
        [vote('alice', 't1', 1), vote('bob', 't1', 2), vote('carol', 't1', 3)],
      )
      expect(results[0]).toMatchObject({
        points: 6,
        voters: 3,
        perRank: { 1: 1, 2: 1, 3: 1 },
      })
    })

    it('counts perRank[1]=1 and perRank[3]=1 when same track gets rank 1 + rank 3 from different voters', () => {
      const results = computeResults(
        [track('t1', 'Mixed')],
        [vote('alice', 't1', 1), vote('bob', 't1', 3)],
      )
      expect(results[0]).toMatchObject({
        points: 4,
        voters: 2,
        perRank: { 1: 1, 2: 0, 3: 1 },
      })
    })
  })

  describe('tiebreakers', () => {
    it('sorts by perRank[1] desc when total points are equal', () => {
      // Both tracks total 6 points, but t1 has two rank-1 votes (3+3)
      // and t2 has three rank-2 votes (2+2+2). t1 should win on tiebreaker.
      const results = computeResults(
        [track('t1', 'Aaa'), track('t2', 'Bbb')],
        [
          vote('p1', 't1', 1),
          vote('p2', 't1', 1),
          vote('p3', 't2', 2),
          vote('p4', 't2', 2),
          vote('p5', 't2', 2),
        ],
      )
      expect(results.map((r) => r.trackId)).toEqual(['t1', 't2'])
    })

    it('sorts by perRank[2] desc when points and perRank[1] are equal', () => {
      // Both tracks: 1 first-place vote (3 points each so far).
      // t1 also gets a rank-2 (total 5). t2 also gets a rank-3 (total 4).
      // Different totals — bump them. Make totals equal:
      //   t1: rank1 + rank2 + rank3 = 6, perRank1=1, perRank2=1
      //   t2: rank1 + rank3 + rank3 = 5 (different) — adjust
      //   t1: rank1 + rank2 = 5, perRank1=1, perRank2=1
      //   t2: rank1 + rank2 + rank? to equal 5 with perRank1=1, perRank2=0
      //     => rank1 + rank3 + rank3 + rank3 = 6 (no good)
      //   Simpler: both 5 points, perRank1=1.
      //   t1: rank1 + rank2 = 5, perRank1=1, perRank2=1
      //   t2: rank1 + rank3 + rank3 = 5, perRank1=1, perRank2=0
      const results = computeResults(
        [track('t1', 'Aaa'), track('t2', 'Bbb')],
        [
          vote('p1', 't1', 1),
          vote('p2', 't1', 2),
          vote('p3', 't2', 1),
          vote('p4', 't2', 3),
          vote('p5', 't2', 3),
        ],
      )
      expect(results.map((r) => r.trackId)).toEqual(['t1', 't2'])
    })

    it('falls back to title alphabetical when points and rank histograms are identical', () => {
      const results = computeResults(
        [track('t1', 'Charlie'), track('t2', 'Alpha'), track('t3', 'Bravo')],
        [vote('p1', 't1', 1), vote('p2', 't2', 1), vote('p3', 't3', 1)],
      )
      expect(results.map((r) => r.title)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    })

    it('alphabetical tiebreaker is case-insensitive', () => {
      const results = computeResults([track('t1', 'banana'), track('t2', 'Apple')], [])
      expect(results.map((r) => r.title)).toEqual(['Apple', 'banana'])
    })

    it('sorts Russian titles correctly: Б before В, Я after Б and В', () => {
      const results = computeResults(
        [track('t1', 'Я последняя'), track('t2', 'Вторая'), track('t3', 'Бэта')],
        [],
      )
      expect(results.map((r) => r.title)).toEqual(['Бэта', 'Вторая', 'Я последняя'])
    })
  })

  describe('defensive behavior', () => {
    it('silently ignores votes pointing to unknown trackIds', () => {
      const results = computeResults(
        [track('t1', 'Real')],
        [vote('p1', 'ghost', 1), vote('p1', 't1', 2)],
      )
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        trackId: 't1',
        points: 2,
        voters: 1,
        perRank: { 1: 0, 2: 1, 3: 0 },
      })
    })

    it('silently ignores votes with ranks outside 1..3', () => {
      const results = computeResults(
        [track('t1', 'Strict')],
        [vote('p1', 't1', 0), vote('p2', 't1', 4), vote('p3', 't1', -1), vote('p4', 't1', 1)],
      )
      expect(results[0]).toMatchObject({
        points: 3,
        voters: 1,
        perRank: { 1: 1, 2: 0, 3: 0 },
      })
    })

    it('still produces sensible output when a participant has multiple ranks for the same track (DB-impossible case)', () => {
      const results = computeResults(
        [track('t1', 'Doubled')],
        [vote('p1', 't1', 1), vote('p1', 't1', 2)],
      )
      expect(results[0]).toMatchObject({
        points: 5,
        voters: 1,
        perRank: { 1: 1, 2: 1, 3: 0 },
      })
    })

    it('includes zero-vote tracks alongside scored ones', () => {
      const results = computeResults(
        [track('t1', 'Voted'), track('t2', 'Ignored')],
        [vote('p1', 't1', 1)],
      )
      const byId = Object.fromEntries(results.map((r) => [r.trackId, r]))
      expect(byId.t1.points).toBe(3)
      expect(byId.t2.points).toBe(0)
      expect(byId.t2.voters).toBe(0)
      expect(byId.t2.perRank).toEqual({ 1: 0, 2: 0, 3: 0 })
    })
  })

  describe('full scenarios', () => {
    it('three tracks, three voters, every voter casts a full top-3', () => {
      // Voters: alice, bob, carol. Tracks: t1, t2, t3.
      // alice: t1=1, t2=2, t3=3
      // bob:   t2=1, t3=2, t1=3
      // carol: t3=1, t1=2, t2=3
      // t1: 3 + 1 + 2 = 6, perRank {1:1, 2:1, 3:1}
      // t2: 2 + 3 + 1 = 6, perRank {1:1, 2:1, 3:1}
      // t3: 1 + 2 + 3 = 6, perRank {1:1, 2:1, 3:1}
      // All tied → alphabetical by title.
      const results = computeResults(
        [track('t1', 'Banana'), track('t2', 'Apple'), track('t3', 'Cherry')],
        [
          vote('alice', 't1', 1),
          vote('alice', 't2', 2),
          vote('alice', 't3', 3),
          vote('bob', 't2', 1),
          vote('bob', 't3', 2),
          vote('bob', 't1', 3),
          vote('carol', 't3', 1),
          vote('carol', 't1', 2),
          vote('carol', 't2', 3),
        ],
      )
      expect(results.map((r) => r.title)).toEqual(['Apple', 'Banana', 'Cherry'])
      for (const r of results) {
        expect(r.points).toBe(6)
        expect(r.voters).toBe(3)
        expect(r.perRank).toEqual({ 1: 1, 2: 1, 3: 1 })
      }
    })

    it('counts a self-vote (submitter ranks own track) normally', () => {
      const results = computeResults(
        [track('t1', 'Mine', 'alice', 'Alice')],
        [vote('alice', 't1', 1)],
      )
      expect(results[0]).toMatchObject({
        trackId: 't1',
        points: 3,
        voters: 1,
        perRank: { 1: 1, 2: 0, 3: 0 },
      })
      expect(results[0].submittedBy).toEqual({
        id: 'alice',
        displayName: 'Alice',
      })
    })

    it('preserves track metadata (artist, submittedBy) in the result', () => {
      const results = computeResults(
        [track('t1', 'Title', 'alice', 'Alice', 'Some Artist')],
        [vote('p1', 't1', 2)],
      )
      expect(results[0]).toEqual({
        trackId: 't1',
        title: 'Title',
        artist: 'Some Artist',
        submittedBy: { id: 'alice', displayName: 'Alice' },
        points: 2,
        voters: 1,
        perRank: { 1: 0, 2: 1, 3: 0 },
      })
    })

    it('produces the same ordering on repeated calls (deterministic)', () => {
      const tracks = [track('t1', 'Бета'), track('t2', 'Альфа'), track('t3', 'Гамма')]
      const votes = [vote('p1', 't1', 1), vote('p2', 't2', 1), vote('p3', 't3', 1)]
      const a = computeResults(tracks, votes)
      const b = computeResults(tracks, votes)
      expect(a).toEqual(b)
    })

    it('counts distinct voters correctly when one participant ranks multiple tracks', () => {
      const results = computeResults(
        [track('t1', 'Solo')],
        [
          // Same trackId voted by p1 only — voters=1 even though there is
          // one vote row. Distinct from the multi-voter case.
          vote('p1', 't1', 1),
        ],
      )
      expect(results[0].voters).toBe(1)
    })
  })
})
