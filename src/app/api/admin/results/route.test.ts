import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import type { ResultsData } from '@/lib/results'

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
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Сессия',
    stage: 'STAGE2',
    adminPasswordHash: 'hashed',
    joinToken: 'jointoken',
    maxParticipants: 30,
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SessionRow
}

function setHeaders(entries: Record<string, string>): void {
  const h = new Headers(entries)
  mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
}

function adminHeaders(): void {
  setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedGetResultsForSession.mockReset()
})

describe('GET /api/admin/results', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await GET()
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    setHeaders({
      'x-auth-kind': 'participant',
      'x-auth-session-id': 'sess_1',
      'x-auth-participant-id': 'p_1',
    })
    const res = await GET()
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when there is no active session', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 200 with empty-vote shape when no participant has voted', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE2' }))
    const empty: ResultsData = {
      results: [
        {
          trackId: 't_1',
          title: 'Alpha',
          artist: null,
          submittedBy: { id: 'p_1', displayName: 'Аня' },
          points: 0,
          voters: 0,
          perRank: { 1: 0, 2: 0, 3: 0 },
        },
      ],
      matrix: {
        participants: [{ id: 'p_1', displayName: 'Аня' }],
        rows: [{ trackId: 't_1', title: 'Alpha', rankByParticipant: { p_1: null } }],
      },
      meta: { totalParticipants: 1, votingParticipants: 0 },
    }
    mockedGetResultsForSession.mockResolvedValue(empty)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<ResultsData>
    expect(body.data.meta.votingParticipants).toBe(0)
    expect(body.data.results[0].points).toBe(0)
    expect(mockedGetResultsForSession).toHaveBeenCalledWith('sess_1')
  })

  it('returns 200 with computed results when there are real votes', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'FINISHED' }))
    const data: ResultsData = {
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
      ],
      matrix: {
        participants: [
          { id: 'p_1', displayName: 'Аня' },
          { id: 'p_2', displayName: 'Боря' },
        ],
        rows: [
          {
            trackId: 't_1',
            title: 'Winner',
            rankByParticipant: { p_1: 1, p_2: 2 },
          },
        ],
      },
      meta: { totalParticipants: 2, votingParticipants: 2 },
    }
    mockedGetResultsForSession.mockResolvedValue(data)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<ResultsData>
    expect(body.data.results[0].points).toBe(5)
    expect(body.data.matrix.rows[0].rankByParticipant).toEqual({ p_1: 1, p_2: 2 })
    expect(body.data.meta.votingParticipants).toBe(2)
  })
})
