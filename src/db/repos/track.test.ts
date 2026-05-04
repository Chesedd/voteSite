import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db/client', () => ({
  prisma: {
    track: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/db/client'
import { listTracks, updateTrack } from './track'

const mockedFindMany = vi.mocked(prisma.track.findMany)
const mockedFindUnique = vi.mocked(prisma.track.findUnique)
const mockedUpdateMany = vi.mocked(prisma.track.updateMany)

beforeEach(() => {
  mockedFindMany.mockReset()
  mockedFindUnique.mockReset()
  mockedUpdateMany.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't_1',
    sessionId: 'sess_1',
    submittedById: 'p_1',
    title: 'Song',
    artist: 'Artist',
    url: null,
    description: null,
    service: null,
    serviceTrackId: null,
    serviceAlbumId: null,
    coverUrl: null,
    embedSupported: false,
    createdAt: new Date('2026-05-03T00:00:00Z'),
    submittedBy: { id: 'p_1', displayName: 'Аня' },
    ...overrides,
  }
}

describe('listTracks', () => {
  it('returns rows shaped with nested submittedBy and no internal fields', async () => {
    mockedFindMany.mockResolvedValue([
      fakeRow(),
      fakeRow({ id: 't_2', submittedBy: { id: 'p_2', displayName: null } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    const result = await listTracks('sess_1')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 't_1',
      title: 'Song',
      artist: 'Artist',
      submittedBy: { id: 'p_1', displayName: 'Аня' },
      embedSupported: false,
    })
    for (const t of result) {
      expect(t).not.toHaveProperty('sessionId')
      expect(t).not.toHaveProperty('submittedById')
    }
    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { sessionId: 'sess_1' },
      include: { submittedBy: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    })
  })
})

describe('updateTrack', () => {
  it('returns null when ownerId does not match an existing track', async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 })
    const result = await updateTrack('t_1', 'p_other', { title: 'New' })
    expect(result).toBeNull()
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: 't_1', submittedById: 'p_other' },
      data: { title: 'New' },
    })
    // Don't re-fetch when no rows updated.
    expect(mockedFindUnique).not.toHaveBeenCalled()
  })

  it('returns the updated row when ownerId matches', async () => {
    mockedUpdateMany.mockResolvedValue({ count: 1 })
    mockedFindUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeRow({ title: 'Renamed' }) as any,
    )
    const result = await updateTrack('t_1', 'p_1', { title: 'Renamed' })
    expect(result?.title).toBe('Renamed')
    expect(result?.submittedBy).toEqual({ id: 'p_1', displayName: 'Аня' })
  })
})
