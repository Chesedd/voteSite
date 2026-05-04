import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import type { SessionSettings } from '@/lib/settings'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
  updateSessionSettings: vi.fn(),
}))

import { headers } from 'next/headers'
import { PATCH } from './route'
import { getActiveSession, updateSessionSettings } from '@/db/repos/session'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedUpdateSessionSettings = vi.mocked(updateSessionSettings)

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

function setHeaders(entries: Record<string, string>): void {
  const h = new Headers(entries)
  mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
}

function adminHeaders(): void {
  setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
}

function makeRequest(body: unknown): Request {
  const h = new Headers({ 'content-type': 'application/json' })
  return new Request('https://example.test/api/admin/settings', {
    method: 'PATCH',
    headers: h,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedUpdateSessionSettings.mockReset()
})

describe('PATCH /api/admin/settings', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await PATCH(makeRequest({ revealResults: true }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedUpdateSessionSettings).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    setHeaders({
      'x-auth-kind': 'participant',
      'x-auth-session-id': 'sess_1',
      'x-auth-participant-id': 'p_1',
    })
    const res = await PATCH(makeRequest({ revealResults: true }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedUpdateSessionSettings).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    adminHeaders()
    const h = new Headers({ 'content-type': 'application/json' })
    const req = new Request('https://example.test/api/admin/settings', {
      method: 'PATCH',
      headers: h,
      body: '{not valid json',
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT when the body has no fields', async () => {
    adminHeaders()
    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateSessionSettings).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when revealResults is not a boolean', async () => {
    adminHeaders()
    const res = await PATCH(makeRequest({ revealResults: 'yes' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateSessionSettings).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT for unknown keys (strict)', async () => {
    adminHeaders()
    const res = await PATCH(makeRequest({ revealResults: true, foo: 'bar' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateSessionSettings).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when there is no active session for this admin', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ revealResults: true }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedUpdateSessionSettings).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE when current stage is STAGE1', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE1' }))
    const res = await PATCH(makeRequest({ revealResults: true }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
    expect(mockedUpdateSessionSettings).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE when current stage is STAGE2', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE2' }))
    const res = await PATCH(makeRequest({ revealResults: true }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
    expect(mockedUpdateSessionSettings).not.toHaveBeenCalled()
  })

  it('returns 200 and updates revealResults to true on FINISHED', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'FINISHED' }))
    mockedUpdateSessionSettings.mockResolvedValue({ revealResults: true })

    const res = await PATCH(makeRequest({ revealResults: true }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ settings: SessionSettings }>
    expect(body.data.settings.revealResults).toBe(true)
    expect(mockedUpdateSessionSettings).toHaveBeenCalledWith('sess_1', { revealResults: true })
  })

  it('returns 200 and updates revealResults to false', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(
      fakeSession({ stage: 'FINISHED', settings: { revealResults: true } }),
    )
    mockedUpdateSessionSettings.mockResolvedValue({ revealResults: false })

    const res = await PATCH(makeRequest({ revealResults: false }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ settings: SessionSettings }>
    expect(body.data.settings.revealResults).toBe(false)
    expect(mockedUpdateSessionSettings).toHaveBeenCalledWith('sess_1', { revealResults: false })
  })
})
