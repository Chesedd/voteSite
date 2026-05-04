import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, ApiSuccess } from '@/lib/api/responses'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
  updateSessionStage: vi.fn(),
}))
vi.mock('@/db/repos/track', () => ({
  getStageStats: vi.fn(),
}))

import { headers } from 'next/headers'
import { POST } from './route'
import { getActiveSession, updateSessionStage } from '@/db/repos/session'
import { getStageStats } from '@/db/repos/track'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedUpdateSessionStage = vi.mocked(updateSessionStage)
const mockedGetStageStats = vi.mocked(getStageStats)

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Сессия',
    stage: 'STAGE1',
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

function makeRequest(body: unknown): Request {
  const h = new Headers({ 'content-type': 'application/json' })
  return new Request('https://example.test/api/admin/stage', {
    method: 'POST',
    headers: h,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedUpdateSessionStage.mockReset()
  mockedGetStageStats.mockReset()
})

describe('POST /api/admin/stage', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await POST(makeRequest({ to: 'STAGE2' }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedUpdateSessionStage).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    setHeaders({
      'x-auth-kind': 'participant',
      'x-auth-session-id': 'sess_1',
      'x-auth-participant-id': 'p_1',
    })
    const res = await POST(makeRequest({ to: 'STAGE2' }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedUpdateSessionStage).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when to is null', async () => {
    adminHeaders()
    const res = await POST(makeRequest({ to: null }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateSessionStage).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when to is an unknown stage value', async () => {
    adminHeaders()
    const res = await POST(makeRequest({ to: 'BOGUS' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateSessionStage).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    adminHeaders()
    const h = new Headers({ 'content-type': 'application/json' })
    const req = new Request('https://example.test/api/admin/stage', {
      method: 'POST',
      headers: h,
      body: '{not valid json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 404 NOT_FOUND when there is no active session', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ to: 'STAGE2' }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedUpdateSessionStage).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE_TRANSITION for STAGE1 → FINISHED', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE1' }))
    const res = await POST(makeRequest({ to: 'FINISHED' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE_TRANSITION')
    expect(body.error.message).toContain('STAGE1')
    expect(body.error.message).toContain('FINISHED')
    expect(mockedGetStageStats).not.toHaveBeenCalled()
    expect(mockedUpdateSessionStage).not.toHaveBeenCalled()
  })

  it('returns 400 STAGE_PREREQUISITES_NOT_MET for STAGE1 → STAGE2 with insufficient tracks', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE1' }))
    mockedGetStageStats.mockResolvedValue({
      participantCount: 2,
      trackCount: 1,
      distinctSubmittersCount: 1,
      voteCount: 0,
    })
    const res = await POST(makeRequest({ to: 'STAGE2' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('STAGE_PREREQUISITES_NOT_MET')
    expect(body.error.message).toContain('3 трека')
    expect(mockedUpdateSessionStage).not.toHaveBeenCalled()
  })

  it('returns 200 and updates the stage for STAGE1 → STAGE2 with sufficient stats', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE1' }))
    mockedGetStageStats.mockResolvedValue({
      participantCount: 3,
      trackCount: 5,
      distinctSubmittersCount: 3,
      voteCount: 0,
    })
    mockedUpdateSessionStage.mockResolvedValue(fakeSession({ stage: 'STAGE2' }))

    const res = await POST(makeRequest({ to: 'STAGE2' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ stage: string }>
    expect(body.ok).toBe(true)
    expect(body.data.stage).toBe('STAGE2')
    expect(mockedUpdateSessionStage).toHaveBeenCalledWith('sess_1', 'STAGE2')
  })

  it('returns 200 for STAGE2 → FINISHED with no votes', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE2' }))
    mockedGetStageStats.mockResolvedValue({
      participantCount: 3,
      trackCount: 5,
      distinctSubmittersCount: 3,
      voteCount: 0,
    })
    mockedUpdateSessionStage.mockResolvedValue(fakeSession({ stage: 'FINISHED' }))

    const res = await POST(makeRequest({ to: 'FINISHED' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ stage: string }>
    expect(body.data.stage).toBe('FINISHED')
    expect(mockedUpdateSessionStage).toHaveBeenCalledWith('sess_1', 'FINISHED')
  })

  it('returns 200 on rollback STAGE2 → STAGE1 without enforcing prerequisites', async () => {
    adminHeaders()
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE2' }))
    // Even with all-zero stats (which would fail the forward STAGE1→STAGE2 check),
    // a rollback skips the prerequisite check.
    mockedGetStageStats.mockResolvedValue({
      participantCount: 0,
      trackCount: 0,
      distinctSubmittersCount: 0,
      voteCount: 0,
    })
    mockedUpdateSessionStage.mockResolvedValue(fakeSession({ stage: 'STAGE1' }))

    const res = await POST(makeRequest({ to: 'STAGE1' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ stage: string }>
    expect(body.data.stage).toBe('STAGE1')
    expect(mockedUpdateSessionStage).toHaveBeenCalledWith('sess_1', 'STAGE1')
  })
})
