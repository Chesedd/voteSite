import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db/repos/track', () => ({
  listTracks: vi.fn(),
}))
vi.mock('@/db/repos/vote', () => ({
  listAllVotes: vi.fn(),
}))
vi.mock('@/db/repos/participant', () => ({
  listParticipants: vi.fn(),
}))

import { listParticipants, type ParticipantPublic } from '@/db/repos/participant'
import { listTracks, type TrackPublic } from '@/db/repos/track'
import { listAllVotes } from '@/db/repos/vote'
import { buildVoterRankMatrix, getResultsForSession } from './results'
import type { TrackResult } from './scoring'

const mockedListTracks = vi.mocked(listTracks)
const mockedListAllVotes = vi.mocked(listAllVotes)
const mockedListParticipants = vi.mocked(listParticipants)

function fakeTrack(overrides: Partial<TrackPublic> = {}): TrackPublic {
  return {
    id: 't_1',
    title: 'Title',
    artist: null,
    url: null,
    description: null,
    service: null,
    serviceTrackId: null,
    serviceAlbumId: null,
    coverUrl: null,
    embedSupported: false,
    submittedBy: { id: 'p_1', displayName: 'Аня' },
    createdAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  }
}

function fakeParticipant(overrides: Partial<ParticipantPublic> = {}): ParticipantPublic {
  return {
    id: 'p_1',
    displayName: 'Аня',
    accessKey: 'KEY00000',
    hasJoined: true,
    lastSeenAt: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  mockedListTracks.mockReset()
  mockedListAllVotes.mockReset()
  mockedListParticipants.mockReset()
})

describe('buildVoterRankMatrix', () => {
  it('initialises every cell to null when there are no votes', () => {
    const results: TrackResult[] = [
      {
        trackId: 't_1',
        title: 'Solo',
        artist: null,
        submittedBy: { id: 'p_1', displayName: 'Аня' },
        points: 0,
        voters: 0,
        perRank: { 1: 0, 2: 0, 3: 0 },
      },
    ]
    const matrix = buildVoterRankMatrix(
      results,
      [],
      [
        { id: 'p_1', displayName: 'Аня' },
        { id: 'p_2', displayName: 'Боря' },
      ],
    )
    expect(matrix.participants).toEqual([
      { id: 'p_1', displayName: 'Аня' },
      { id: 'p_2', displayName: 'Боря' },
    ])
    expect(matrix.rows).toHaveLength(1)
    expect(matrix.rows[0].rankByParticipant).toEqual({ p_1: null, p_2: null })
  })

  it('places ranks at the right (track, participant) cells', () => {
    const results: TrackResult[] = [
      {
        trackId: 't_a',
        title: 'A',
        artist: null,
        submittedBy: { id: 'p_1', displayName: 'Аня' },
        points: 0,
        voters: 0,
        perRank: { 1: 0, 2: 0, 3: 0 },
      },
      {
        trackId: 't_b',
        title: 'B',
        artist: null,
        submittedBy: { id: 'p_1', displayName: 'Аня' },
        points: 0,
        voters: 0,
        perRank: { 1: 0, 2: 0, 3: 0 },
      },
    ]
    const matrix = buildVoterRankMatrix(
      results,
      [
        { participantId: 'p_1', trackId: 't_a', rank: 1 },
        { participantId: 'p_2', trackId: 't_a', rank: 2 },
        { participantId: 'p_2', trackId: 't_b', rank: 1 },
      ],
      [
        { id: 'p_1', displayName: 'Аня' },
        { id: 'p_2', displayName: 'Боря' },
      ],
    )
    const rowA = matrix.rows.find((r) => r.trackId === 't_a')!
    const rowB = matrix.rows.find((r) => r.trackId === 't_b')!
    expect(rowA.rankByParticipant).toEqual({ p_1: 1, p_2: 2 })
    expect(rowB.rankByParticipant).toEqual({ p_1: null, p_2: 1 })
  })

  it('row order matches the results sort order', () => {
    const results: TrackResult[] = [
      {
        trackId: 't_b',
        title: 'B winner',
        artist: null,
        submittedBy: { id: 'p_1', displayName: null },
        points: 6,
        voters: 2,
        perRank: { 1: 2, 2: 0, 3: 0 },
      },
      {
        trackId: 't_a',
        title: 'A loser',
        artist: null,
        submittedBy: { id: 'p_2', displayName: null },
        points: 1,
        voters: 1,
        perRank: { 1: 0, 2: 0, 3: 1 },
      },
    ]
    const matrix = buildVoterRankMatrix(results, [], [{ id: 'p_1', displayName: null }])
    expect(matrix.rows.map((r) => r.trackId)).toEqual(['t_b', 't_a'])
  })

  it('ignores votes from unknown participantIds and unknown trackIds', () => {
    const results: TrackResult[] = [
      {
        trackId: 't_1',
        title: 'Real',
        artist: null,
        submittedBy: { id: 'p_1', displayName: null },
        points: 0,
        voters: 0,
        perRank: { 1: 0, 2: 0, 3: 0 },
      },
    ]
    const matrix = buildVoterRankMatrix(
      results,
      [
        { participantId: 'ghost', trackId: 't_1', rank: 1 },
        { participantId: 'p_1', trackId: 'phantom', rank: 1 },
        { participantId: 'p_1', trackId: 't_1', rank: 2 },
      ],
      [{ id: 'p_1', displayName: 'Аня' }],
    )
    expect(matrix.rows[0].rankByParticipant).toEqual({ p_1: 2 })
  })
})

describe('getResultsForSession', () => {
  it('returns empty results and zero counts when there are no tracks/votes/participants', async () => {
    mockedListTracks.mockResolvedValue([])
    mockedListAllVotes.mockResolvedValue([])
    mockedListParticipants.mockResolvedValue([])

    const data = await getResultsForSession('sess_1')
    expect(data.results).toEqual([])
    expect(data.matrix.rows).toEqual([])
    expect(data.matrix.participants).toEqual([])
    expect(data.meta).toEqual({ totalParticipants: 0, votingParticipants: 0 })
  })

  it('returns zero-vote results when tracks exist but no votes', async () => {
    mockedListTracks.mockResolvedValue([
      fakeTrack({ id: 't_1', title: 'A' }),
      fakeTrack({ id: 't_2', title: 'B' }),
    ])
    mockedListAllVotes.mockResolvedValue([])
    mockedListParticipants.mockResolvedValue([
      fakeParticipant({ id: 'p_1' }),
      fakeParticipant({ id: 'p_2' }),
    ])

    const data = await getResultsForSession('sess_1')
    expect(data.results).toHaveLength(2)
    for (const r of data.results) {
      expect(r.points).toBe(0)
      expect(r.voters).toBe(0)
    }
    expect(data.meta).toEqual({ totalParticipants: 2, votingParticipants: 0 })
  })

  it('computes results, matrix, and distinct voter count from real data', async () => {
    mockedListTracks.mockResolvedValue([
      fakeTrack({ id: 't_1', title: 'Alpha' }),
      fakeTrack({ id: 't_2', title: 'Beta' }),
    ])
    mockedListAllVotes.mockResolvedValue([
      { participantId: 'p_1', trackId: 't_1', rank: 1 },
      { participantId: 'p_1', trackId: 't_2', rank: 2 },
      { participantId: 'p_2', trackId: 't_1', rank: 2 },
    ])
    mockedListParticipants.mockResolvedValue([
      fakeParticipant({ id: 'p_1', displayName: 'Аня' }),
      fakeParticipant({ id: 'p_2', displayName: 'Боря' }),
      fakeParticipant({ id: 'p_3', displayName: 'Витя' }),
    ])

    const data = await getResultsForSession('sess_1')
    expect(data.results.map((r) => r.trackId)).toEqual(['t_1', 't_2'])
    const t1 = data.results.find((r) => r.trackId === 't_1')!
    expect(t1.points).toBe(5)
    expect(t1.voters).toBe(2)

    expect(data.meta).toEqual({ totalParticipants: 3, votingParticipants: 2 })
    expect(data.matrix.participants).toHaveLength(3)
    const matrixT1 = data.matrix.rows.find((r) => r.trackId === 't_1')!
    expect(matrixT1.rankByParticipant).toEqual({ p_1: 1, p_2: 2, p_3: null })
  })
})
