import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))

import { headers } from 'next/headers'
import { GET } from './route'
import { getActiveSession } from '@/db/repos/session'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-04T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Голосование',
    stage: 'STAGE2',
    adminPasswordHash: 'hashed',
    joinToken: 'tok_abc',
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

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
})

type SessionPayload = {
  id: string
  title: string
  stage: string
  maxParticipants: number
  settings: { revealResults?: boolean }
  joinToken?: string
}

describe('GET /api/session', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await GET()
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedGetActiveSession).not.toHaveBeenCalled()
  })

  it('returns the full session including joinToken to an admin', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    mockedGetActiveSession.mockResolvedValue(fakeSession())

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<SessionPayload>
    expect(body.data).toEqual({
      id: 'sess_1',
      title: 'Голосование',
      stage: 'STAGE2',
      maxParticipants: 30,
      settings: {},
      joinToken: 'tok_abc',
    })
  })

  it('omits joinToken for participants', async () => {
    setHeaders({
      'x-auth-kind': 'participant',
      'x-auth-session-id': 'sess_1',
      'x-auth-participant-id': 'p_1',
    })
    mockedGetActiveSession.mockResolvedValue(fakeSession())

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<SessionPayload>
    expect(body.data.id).toBe('sess_1')
    expect(body.data.title).toBe('Голосование')
    expect(body.data.stage).toBe('STAGE2')
    expect(body.data.maxParticipants).toBe(30)
    expect(body.data.settings).toEqual({})
    expect(body.data.joinToken).toBeUndefined()
  })

  it('returns 404 NOT_FOUND when there is no active session', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    mockedGetActiveSession.mockResolvedValue(null)

    const res = await GET()
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('returns 404 NOT_FOUND when the active session id does not match the token', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_old' })
    mockedGetActiveSession.mockResolvedValue(fakeSession({ id: 'sess_new' }))

    const res = await GET()
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
