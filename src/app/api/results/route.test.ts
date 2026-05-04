import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import type { ResultsData } from '@/lib/results'
import type { TrackResult } from '@/lib/scoring'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))
vi.mock('@/lib/results', () => ({
  getResultsForSession: vi.fn(),
}))

import { headers } from 'next/headers'
import { GET } from './route'
import { getActiveSession } from '@/db/repos/session'
import { getResultsForSession } from '@/lib/results'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedGetResultsForSession = vi.mocked(getResultsForSession)

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-04T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Сессия',
    stage: 'FINISHED',
    adminPasswordHash: 'hashed',
    joinToken: 'tok_abc',
    maxParticipants: 30,
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SessionRow
}

function fakeResults(): ResultsData {
  return {
    results: [
      {
        trackId: 't_1',
        title: 'Winner',
        artist: 'A',
        submittedBy: { id: 'p_1', displayName: 'Аня' },
        points: 5,
        voters: 2,
        perRank: { 1: 1, 2: 1, 3: 0 },
      },
      {
        trackId: 't_2',
        title: 'Runner-up',
        artist: 'B',
        submittedBy: { id: 'p_2', displayName: 'Боря' },
        points: 2,
        voters: 1,
        perRank: { 1: 0, 2: 1, 3: 0 },
      },
    ],
    matrix: {
      participants: [
        { id: 'p_1', displayName: 'Аня' },
        { id: 'p_2', displayName: 'Боря' },
      ],
      rows: [
        { trackId: 't_1', title: 'Winner', rankByParticipant: { p_1: 1, p_2: 2 } },
        { trackId: 't_2', title: 'Runner-up', rankByParticipant: { p_1: 2, p_2: null } },
      ],
    },
    meta: { totalParticipants: 2, votingParticipants: 2 },
  }
}

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

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedGetResultsForSession.mockReset()
})

describe('GET /api/results (participant)', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await GET()
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is an admin', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const res = await GET()
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when there is no active session', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 400 RESULTS_HIDDEN when stage is STAGE1', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE1' }))
    const res = await GET()
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('RESULTS_HIDDEN')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 400 RESULTS_HIDDEN when stage is STAGE2', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE2' }))
    const res = await GET()
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('RESULTS_HIDDEN')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 400 RESULTS_HIDDEN when revealResults is false', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(
      fakeSession({ stage: 'FINISHED', settings: { revealResults: false } }),
    )
    const res = await GET()
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('RESULTS_HIDDEN')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 400 RESULTS_HIDDEN when revealResults key is absent', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'FINISHED', settings: {} }))
    const res = await GET()
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('RESULTS_HIDDEN')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 200 with ranked results when stage=FINISHED and revealed', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(
      fakeSession({ stage: 'FINISHED', settings: { revealResults: true } }),
    )
    mockedGetResultsForSession.mockResolvedValue(fakeResults())

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<TrackResult[]>
    expect(body.data).toHaveLength(2)
    expect(body.data[0].trackId).toBe('t_1')
    expect(body.data[0].points).toBe(5)
    expect(mockedGetResultsForSession).toHaveBeenCalledWith('sess_1')
  })

  it('omits voter matrix and meta from the response', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(
      fakeSession({ stage: 'FINISHED', settings: { revealResults: true } }),
    )
    mockedGetResultsForSession.mockResolvedValue(fakeResults())

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<TrackResult[]> & {
      data: { matrix?: unknown; meta?: unknown }
    }
    // Response should be the bare TrackResult[] — no matrix, no meta wrapper.
    expect(Array.isArray(body.data)).toBe(true)
    expect((body.data as unknown as { matrix?: unknown }).matrix).toBeUndefined()
    expect((body.data as unknown as { meta?: unknown }).meta).toBeUndefined()
  })
})
