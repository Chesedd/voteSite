import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import type { VotesByRank } from '@/db/repos/vote'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))
vi.mock('@/db/repos/vote', () => ({
  removeVoteAtRank: vi.fn(),
}))

import { headers } from 'next/headers'
import { DELETE } from './route'
import { getActiveSession } from '@/db/repos/session'
import { removeVoteAtRank } from '@/db/repos/vote'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedRemoveVote = vi.mocked(removeVoteAtRank)

function setHeaders(entries: Record<string, string>): void {
  const h = new Headers(entries)
  mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
}

function participantHeaders(): void {
  setHeaders({
    'x-auth-kind': 'participant',
    'x-auth-session-id': 'sess_1',
    'x-auth-participant-id': 'p_1',
  })
}

function fakeSession(stage: 'STAGE1' | 'STAGE2' | 'FINISHED' = 'STAGE2') {
  return {
    id: 'sess_1',
    title: 'Vote',
    stage,
    adminPasswordHash: 'h',
    joinToken: 'tok',
    maxParticipants: 30,
    settings: {},
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  }
}

function makeContext(rank: string) {
  return { params: Promise.resolve({ rank }) }
}

function deleteRequest(): Request {
  return new Request('https://example.test/api/votes/1', { method: 'DELETE' })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedRemoveVote.mockReset()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE2') as any)
  mockedRemoveVote.mockResolvedValue({ 1: null, 2: null, 3: null })
})

describe('DELETE /api/votes/[rank]', () => {
  it('returns 401 UNAUTHORIZED with no auth', async () => {
    setHeaders({})
    const res = await DELETE(deleteRequest(), makeContext('1'))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedRemoveVote).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when actor is admin', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const res = await DELETE(deleteRequest(), makeContext('1'))
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedRemoveVote).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE when stage is STAGE1', async () => {
    participantHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE1') as any)
    const res = await DELETE(deleteRequest(), makeContext('1'))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
    expect(mockedRemoveVote).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when rank is "0"', async () => {
    participantHeaders()
    const res = await DELETE(deleteRequest(), makeContext('0'))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedRemoveVote).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when rank is non-numeric', async () => {
    participantHeaders()
    const res = await DELETE(deleteRequest(), makeContext('abc'))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT when rank is "4"', async () => {
    participantHeaders()
    const res = await DELETE(deleteRequest(), makeContext('4'))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 404 NOT_FOUND when there is no active session', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await DELETE(deleteRequest(), makeContext('1'))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('idempotent: returns 200 with empty rank when no vote existed at that rank', async () => {
    participantHeaders()
    mockedRemoveVote.mockResolvedValue({
      1: { trackId: 't_keep' },
      2: null,
      3: null,
    })
    const res = await DELETE(deleteRequest(), makeContext('3'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<VotesByRank>
    expect(body.data[3]).toBeNull()
    expect(mockedRemoveVote).toHaveBeenCalledWith({ participantId: 'p_1', rank: 3 })
  })

  it('happy path: deletes a vote at rank 2 and returns updated state', async () => {
    participantHeaders()
    mockedRemoveVote.mockResolvedValue({
      1: { trackId: 't_a' },
      2: null,
      3: { trackId: 't_c' },
    })
    const res = await DELETE(deleteRequest(), makeContext('2'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<VotesByRank>
    expect(body.data[2]).toBeNull()
    expect(body.data[1]).toEqual({ trackId: 't_a' })
    expect(body.data[3]).toEqual({ trackId: 't_c' })
    expect(mockedRemoveVote).toHaveBeenCalledWith({ participantId: 'p_1', rank: 2 })
  })
})
