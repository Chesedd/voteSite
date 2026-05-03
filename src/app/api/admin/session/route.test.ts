import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, ApiSuccess } from '@/lib/api/responses'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
  updateSessionTitle: vi.fn(),
}))

import { headers } from 'next/headers'
import { PATCH } from './route'
import { getActiveSession, updateSessionTitle } from '@/db/repos/session'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedUpdateSessionTitle = vi.mocked(updateSessionTitle)

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Старое название',
    stage: 'STAGE1',
    adminPasswordHash: 'hashed',
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

function makeRequest(body: unknown): Request {
  const h = new Headers({ 'content-type': 'application/json' })
  return new Request('https://example.test/api/admin/session', {
    method: 'PATCH',
    headers: h,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedUpdateSessionTitle.mockReset()
})

describe('PATCH /api/admin/session', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await PATCH(makeRequest({ title: 'Новое' }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedUpdateSessionTitle).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    setHeaders({
      'x-auth-kind': 'participant',
      'x-auth-session-id': 'sess_1',
      'x-auth-participant-id': 'p_1',
    })
    const res = await PATCH(makeRequest({ title: 'Новое' }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedUpdateSessionTitle).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when the body has no fields to update', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateSessionTitle).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when the title is too long', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const res = await PATCH(makeRequest({ title: 'a'.repeat(121) }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateSessionTitle).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when the title is blank after trim', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const res = await PATCH(makeRequest({ title: '   ' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateSessionTitle).not.toHaveBeenCalled()
  })

  it('returns 200 and updates the title with a trimmed value on a valid request', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    const updated = fakeSession({ title: 'Новое название' })
    mockedUpdateSessionTitle.mockResolvedValue(updated)

    const res = await PATCH(makeRequest({ title: '  Новое название  ' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ session: SessionRow }>
    expect(body.ok).toBe(true)
    expect(body.data.session.title).toBe('Новое название')

    expect(mockedUpdateSessionTitle).toHaveBeenCalledWith('sess_1', 'Новое название')
  })

  it('returns 404 NOT_FOUND when there is no active session for this admin', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    mockedGetActiveSession.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ title: 'Новое' }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedUpdateSessionTitle).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const h = new Headers({ 'content-type': 'application/json' })
    const req = new Request('https://example.test/api/admin/session', {
      method: 'PATCH',
      headers: h,
      body: '{not valid json',
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })
})
