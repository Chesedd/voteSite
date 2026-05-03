import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db/client', () => ({
  prisma: {
    participant: { count: vi.fn() },
    track: { count: vi.fn() },
    vote: { count: vi.fn() },
  },
}))

import { prisma } from '@/db/client'
import { getAdminOverview } from './admin'

const mockedParticipantCount = vi.mocked(prisma.participant.count)
const mockedTrackCount = vi.mocked(prisma.track.count)
const mockedVoteCount = vi.mocked(prisma.vote.count)

beforeEach(() => {
  mockedParticipantCount.mockReset()
  mockedTrackCount.mockReset()
  mockedVoteCount.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getAdminOverview', () => {
  it('aggregates counts scoped to the given session', async () => {
    mockedParticipantCount.mockResolvedValue(7)
    mockedTrackCount.mockResolvedValue(12)
    mockedVoteCount.mockResolvedValue(21)

    const result = await getAdminOverview('sess_1')

    expect(result).toEqual({ participants: 7, tracks: 12, votes: 21 })
    expect(mockedParticipantCount).toHaveBeenCalledWith({ where: { sessionId: 'sess_1' } })
    expect(mockedTrackCount).toHaveBeenCalledWith({ where: { sessionId: 'sess_1' } })
    expect(mockedVoteCount).toHaveBeenCalledWith({ where: { sessionId: 'sess_1' } })
  })

  it('returns zeros for an empty session', async () => {
    mockedParticipantCount.mockResolvedValue(0)
    mockedTrackCount.mockResolvedValue(0)
    mockedVoteCount.mockResolvedValue(0)

    const result = await getAdminOverview('sess_empty')

    expect(result).toEqual({ participants: 0, tracks: 0, votes: 0 })
  })
})
