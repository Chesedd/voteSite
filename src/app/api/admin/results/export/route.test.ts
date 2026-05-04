import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError } from '@/lib/api/responses'
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
    stage: 'FINISHED',
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

describe('GET /api/admin/results/export', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await GET()
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedGetResultsForSession).not.toHaveBeenCalled()
  })

  it('returns 200 text/csv with the UTF-8 BOM and an attachment header', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ id: 'sess_1' }))
    const data: ResultsData = {
      results: [
        {
          trackId: 't_1',
          title: 'Alpha',
          artist: 'Artist',
          submittedBy: { id: 'p_1', displayName: 'Аня' },
          points: 3,
          voters: 1,
          perRank: { 1: 1, 2: 0, 3: 0 },
        },
      ],
      matrix: {
        participants: [{ id: 'p_1', displayName: 'Аня' }],
        rows: [{ trackId: 't_1', title: 'Alpha', rankByParticipant: { p_1: 1 } }],
      },
      meta: { totalParticipants: 1, votingParticipants: 1 },
    }
    mockedGetResultsForSession.mockResolvedValue(data)

    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-type')).toContain('utf-8')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('results-sess_1-')
    expect(disposition).toContain('.csv')

    const buf = new Uint8Array(await res.arrayBuffer())
    // UTF-8 BOM bytes: EF BB BF — required for Excel to detect Cyrillic.
    // Response.text() decodes via the Web spec, which strips the BOM, so we
    // assert against the raw bytes here.
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf])
    const body = new TextDecoder('utf-8').decode(buf.slice(3))
    expect(body).toContain(
      'Место,Трек,Артист,Добавил,Очки,Голосовавших,Голосов 1-го,Голосов 2-го,Голосов 3-го',
    )
    expect(body).toContain('1,Alpha,Artist,Аня,3,1,1,0,0')
  })

  it('escapes track titles containing commas and quotes in the CSV body', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    const data: ResultsData = {
      results: [
        {
          trackId: 't_1',
          title: 'Hello, "World"',
          artist: 'A,B',
          submittedBy: { id: 'p_1', displayName: null },
          points: 3,
          voters: 1,
          perRank: { 1: 1, 2: 0, 3: 0 },
        },
      ],
      matrix: { participants: [], rows: [] },
      meta: { totalParticipants: 1, votingParticipants: 1 },
    }
    mockedGetResultsForSession.mockResolvedValue(data)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('"Hello, ""World"""')
    expect(body).toContain('"A,B"')
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
})
