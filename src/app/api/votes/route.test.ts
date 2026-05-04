import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import type { VotesByRank } from '@/db/repos/vote'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))
vi.mock('@/db/repos/track', () => ({
  findTrackSessionId: vi.fn(),
}))
vi.mock('@/db/repos/vote', () => ({
  placeVote: vi.fn(),
}))

import { headers } from 'next/headers'
import { PUT } from './route'
import { getActiveSession } from '@/db/repos/session'
import { findTrackSessionId } from '@/db/repos/track'
import { placeVote } from '@/db/repos/vote'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedFindTrackSessionId = vi.mocked(findTrackSessionId)
const mockedPlaceVote = vi.mocked(placeVote)

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

function putRequest(body: unknown): Request {
  return new Request('https://example.test/api/votes', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedFindTrackSessionId.mockReset()
  mockedPlaceVote.mockReset()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE2') as any)
  mockedFindTrackSessionId.mockResolvedValue('sess_1')
})

describe('PUT /api/votes', () => {
  it('returns 401 UNAUTHORIZED with no auth', async () => {
    setHeaders({})
    const res = await PUT(putRequest({ trackId: 't_a', rank: 1 }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedPlaceVote).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when actor is admin', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const res = await PUT(putRequest({ trackId: 't_a', rank: 1 }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedPlaceVote).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when there is no active session', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await PUT(putRequest({ trackId: 't_a', rank: 1 }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 INVALID_STAGE when stage is STAGE1', async () => {
    participantHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE1') as any)
    const res = await PUT(putRequest({ trackId: 't_a', rank: 1 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
    expect(mockedPlaceVote).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE when stage is FINISHED', async () => {
    participantHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('FINISHED') as any)
    const res = await PUT(putRequest({ trackId: 't_a', rank: 1 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
  })

  it('returns 400 INVALID_INPUT for malformed JSON', async () => {
    participantHeaders()
    const req = new Request('https://example.test/api/votes', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for empty body', async () => {
    participantHeaders()
    const res = await PUT(putRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedPlaceVote).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT for missing trackId', async () => {
    participantHeaders()
    const res = await PUT(putRequest({ rank: 1 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for empty trackId', async () => {
    participantHeaders()
    const res = await PUT(putRequest({ trackId: '', rank: 1 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for rank = 0', async () => {
    participantHeaders()
    const res = await PUT(putRequest({ trackId: 't_a', rank: 0 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for rank = 4', async () => {
    participantHeaders()
    const res = await PUT(putRequest({ trackId: 't_a', rank: 4 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for non-numeric rank', async () => {
    participantHeaders()
    const res = await PUT(putRequest({ trackId: 't_a', rank: 'abc' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 404 NOT_FOUND when track does not exist', async () => {
    participantHeaders()
    mockedFindTrackSessionId.mockResolvedValue(null)
    const res = await PUT(putRequest({ trackId: 't_unknown', rank: 1 }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedPlaceVote).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when track belongs to a different session (defensive)', async () => {
    participantHeaders()
    mockedFindTrackSessionId.mockResolvedValue('sess_other')
    const res = await PUT(putRequest({ trackId: 't_other', rank: 1 }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedPlaceVote).not.toHaveBeenCalled()
  })

  it('happy path: places a vote at rank 2 and returns the new VotesByRank', async () => {
    participantHeaders()
    mockedPlaceVote.mockResolvedValue({
      1: null,
      2: { trackId: 't_a' },
      3: null,
    })
    const res = await PUT(putRequest({ trackId: 't_a', rank: 2 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<VotesByRank>
    expect(body.data).toEqual({ 1: null, 2: { trackId: 't_a' }, 3: null })
    expect(mockedPlaceVote).toHaveBeenCalledWith({
      participantId: 'p_1',
      sessionId: 'sess_1',
      trackId: 't_a',
      rank: 2,
    })
  })

  it('replaces an existing vote at the same rank (slot replace)', async () => {
    participantHeaders()
    // After replacement: rank 1 holds the new track. The repo returns the
    // authoritative state — rank 2 and 3 unaffected if they were unset.
    mockedPlaceVote.mockResolvedValue({
      1: { trackId: 't_new' },
      2: null,
      3: null,
    })
    const res = await PUT(putRequest({ trackId: 't_new', rank: 1 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<VotesByRank>
    expect(body.data[1]).toEqual({ trackId: 't_new' })
  })

  it('moves a track from one rank to another (clears the old rank)', async () => {
    participantHeaders()
    // The track was at rank 3, now placed at rank 1. The repo's transactional
    // delete-by-track ensures rank 3 is freed.
    mockedPlaceVote.mockResolvedValue({
      1: { trackId: 't_a' },
      2: null,
      3: null,
    })
    const res = await PUT(putRequest({ trackId: 't_a', rank: 1 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<VotesByRank>
    expect(body.data[1]).toEqual({ trackId: 't_a' })
    expect(body.data[3]).toBeNull()
  })

  it('idempotent: placing the same track at the same rank returns the same state', async () => {
    participantHeaders()
    mockedPlaceVote.mockResolvedValue({
      1: { trackId: 't_a' },
      2: null,
      3: null,
    })
    const res = await PUT(putRequest({ trackId: 't_a', rank: 1 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<VotesByRank>
    expect(body.data[1]).toEqual({ trackId: 't_a' })
  })

  it('rejects extra fields in the body (strict)', async () => {
    participantHeaders()
    const res = await PUT(putRequest({ trackId: 't_a', rank: 1, extra: 'nope' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })
})
