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
  getVotesByRankForParticipant: vi.fn(),
}))

import { headers } from 'next/headers'
import { GET } from './route'
import { getActiveSession } from '@/db/repos/session'
import { getVotesByRankForParticipant } from '@/db/repos/vote'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedGetVotes = vi.mocked(getVotesByRankForParticipant)

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

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedGetVotes.mockReset()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE2') as any)
})

describe('GET /api/votes/me', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await GET()
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedGetVotes).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN for an admin actor', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const res = await GET()
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedGetVotes).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE when stage is STAGE1', async () => {
    participantHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE1') as any)
    const res = await GET()
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
    expect(mockedGetVotes).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE when stage is FINISHED', async () => {
    participantHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('FINISHED') as any)
    const res = await GET()
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
  })

  it('returns 404 NOT_FOUND when there is no active session', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('returns all-null state when participant has no votes', async () => {
    participantHeaders()
    mockedGetVotes.mockResolvedValue({ 1: null, 2: null, 3: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<VotesByRank>
    expect(body.data).toEqual({ 1: null, 2: null, 3: null })
    expect(mockedGetVotes).toHaveBeenCalledWith('p_1')
  })

  it("returns the participant's ranked votes when present", async () => {
    participantHeaders()
    mockedGetVotes.mockResolvedValue({
      1: { trackId: 't_a' },
      2: null,
      3: { trackId: 't_c' },
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<VotesByRank>
    expect(body.data).toEqual({
      1: { trackId: 't_a' },
      2: null,
      3: { trackId: 't_c' },
    })
  })
})
