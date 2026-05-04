import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db/client', () => ({
  prisma: {
    vote: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    // The repo uses prisma.$transaction([a, b, c]) (array form). The mock
    // resolves with an empty array — the route layer ignores the return
    // value and re-fetches state via getVotesByRankForParticipant.
    $transaction: vi.fn(async (ops: unknown[]) => ops.map(() => ({}))),
  },
}))

import { prisma } from '@/db/client'
import { getVotesByRankForParticipant, listAllVotes, placeVote, removeVoteAtRank } from './vote'

const mockedFindMany = vi.mocked(prisma.vote.findMany)
const mockedDeleteMany = vi.mocked(prisma.vote.deleteMany)
const mockedCreate = vi.mocked(prisma.vote.create)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedTransaction = vi.mocked(prisma.$transaction as any)

beforeEach(() => {
  mockedFindMany.mockReset()
  mockedDeleteMany.mockReset()
  mockedCreate.mockReset()
  mockedTransaction.mockReset()
  mockedTransaction.mockImplementation(async (ops: unknown[]) => ops.map(() => ({})))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getVotesByRankForParticipant', () => {
  it('returns the correct shape from query results', async () => {
    mockedFindMany.mockResolvedValue([
      { rank: 1, trackId: 't_a' },
      { rank: 3, trackId: 't_c' },
      { rank: 2, trackId: 't_b' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    const result = await getVotesByRankForParticipant('p_1')
    expect(result).toEqual({
      1: { trackId: 't_a' },
      2: { trackId: 't_b' },
      3: { trackId: 't_c' },
    })
    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { participantId: 'p_1' },
      select: { rank: true, trackId: true },
    })
  })

  it('fills nulls for missing ranks', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFindMany.mockResolvedValue([{ rank: 1, trackId: 't_a' }] as any)
    const result = await getVotesByRankForParticipant('p_1')
    expect(result).toEqual({
      1: { trackId: 't_a' },
      2: null,
      3: null,
    })
  })

  it('returns all nulls when there are no votes', async () => {
    mockedFindMany.mockResolvedValue([])
    const result = await getVotesByRankForParticipant('p_1')
    expect(result).toEqual({ 1: null, 2: null, 3: null })
  })

  it('ignores rows with out-of-range ranks defensively', async () => {
    mockedFindMany.mockResolvedValue([
      { rank: 0, trackId: 't_zero' },
      { rank: 4, trackId: 't_four' },
      { rank: 2, trackId: 't_b' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)
    const result = await getVotesByRankForParticipant('p_1')
    expect(result).toEqual({ 1: null, 2: { trackId: 't_b' }, 3: null })
  })
})

describe('placeVote', () => {
  it('runs delete-by-rank, delete-by-track, and create inside one transaction', async () => {
    mockedFindMany.mockResolvedValue([])
    await placeVote({
      participantId: 'p_1',
      sessionId: 'sess_1',
      trackId: 't_a',
      rank: 2,
    })
    expect(mockedTransaction).toHaveBeenCalledTimes(1)
    expect(mockedDeleteMany).toHaveBeenNthCalledWith(1, {
      where: { participantId: 'p_1', rank: 2 },
    })
    expect(mockedDeleteMany).toHaveBeenNthCalledWith(2, {
      where: { participantId: 'p_1', trackId: 't_a' },
    })
    expect(mockedCreate).toHaveBeenCalledWith({
      data: { participantId: 'p_1', sessionId: 'sess_1', trackId: 't_a', rank: 2 },
    })
  })

  it('returns the updated VotesByRank state from a fresh fetch', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFindMany.mockResolvedValue([{ rank: 2, trackId: 't_a' }] as any)
    const result = await placeVote({
      participantId: 'p_1',
      sessionId: 'sess_1',
      trackId: 't_a',
      rank: 2,
    })
    expect(result).toEqual({ 1: null, 2: { trackId: 't_a' }, 3: null })
    // The post-tx fetch must scope to this participant.
    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { participantId: 'p_1' },
      select: { rank: true, trackId: true },
    })
  })
})

describe('removeVoteAtRank', () => {
  it('deletes the vote at the given (participantId, rank) and returns updated state', async () => {
    mockedFindMany.mockResolvedValue([])
    const result = await removeVoteAtRank({ participantId: 'p_1', rank: 2 })
    expect(mockedDeleteMany).toHaveBeenCalledWith({
      where: { participantId: 'p_1', rank: 2 },
    })
    expect(result).toEqual({ 1: null, 2: null, 3: null })
  })

  it('is a no-op idempotency: deleteMany matches zero rows but still returns state', async () => {
    mockedDeleteMany.mockResolvedValue({ count: 0 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFindMany.mockResolvedValue([{ rank: 1, trackId: 't_keep' }] as any)
    const result = await removeVoteAtRank({ participantId: 'p_1', rank: 3 })
    expect(result).toEqual({ 1: { trackId: 't_keep' }, 2: null, 3: null })
  })
})

describe('listAllVotes', () => {
  it('queries by sessionId and selects only the public columns', async () => {
    mockedFindMany.mockResolvedValue([
      { participantId: 'p_1', trackId: 't_a', rank: 1 },
      { participantId: 'p_2', trackId: 't_b', rank: 2 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)
    const rows = await listAllVotes('sess_1')
    expect(rows).toHaveLength(2)
    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { sessionId: 'sess_1' },
      select: { participantId: true, trackId: true, rank: true },
    })
  })
})
