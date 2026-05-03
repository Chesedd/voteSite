import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import type { TrackPublic } from '@/db/repos/track'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))
vi.mock('@/db/repos/track', () => ({
  deleteTrack: vi.fn(),
  getTrack: vi.fn(),
  updateTrack: vi.fn(),
}))

import { headers } from 'next/headers'
import { DELETE, PATCH } from './route'
import { getActiveSession } from '@/db/repos/session'
import { deleteTrack, getTrack, updateTrack } from '@/db/repos/track'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedGetTrack = vi.mocked(getTrack)
const mockedUpdateTrack = vi.mocked(updateTrack)
const mockedDeleteTrack = vi.mocked(deleteTrack)

function setHeaders(entries: Record<string, string>): void {
  const h = new Headers(entries)
  mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
}

function adminHeaders(): void {
  setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
}

function participantHeaders(participantId = 'p_1'): void {
  setHeaders({
    'x-auth-kind': 'participant',
    'x-auth-session-id': 'sess_1',
    'x-auth-participant-id': participantId,
  })
}

function fakeSession(stage: 'STAGE1' | 'STAGE2' | 'FINISHED' = 'STAGE1') {
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

function fakeTrack(overrides: Partial<TrackPublic> = {}): TrackPublic {
  return {
    id: 't_1',
    title: 'Song',
    artist: null,
    url: null,
    description: null,
    service: null,
    serviceTrackId: null,
    coverUrl: null,
    embedSupported: false,
    submittedBy: { id: 'p_1', displayName: 'Аня' },
    createdAt: new Date('2026-05-03T00:00:00Z'),
    ...overrides,
  }
}

function patchRequest(body: unknown): Request {
  return new Request('https://example.test/api/tracks/t_1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function deleteRequest(): Request {
  return new Request('https://example.test/api/tracks/t_1', { method: 'DELETE' })
}

function ctx(id = 't_1') {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedGetTrack.mockReset()
  mockedUpdateTrack.mockReset()
  mockedDeleteTrack.mockReset()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE1') as any)
})

describe('PATCH /api/tracks/:id', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await PATCH(patchRequest({ title: 'New' }), ctx())
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedUpdateTrack).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when the track does not exist', async () => {
    participantHeaders()
    mockedGetTrack.mockResolvedValue(null)
    const res = await PATCH(patchRequest({ title: 'New' }), ctx('t_missing'))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedUpdateTrack).not.toHaveBeenCalled()
  })

  it('returns 403 OWNERSHIP_REQUIRED when the participant does not own the track', async () => {
    participantHeaders('p_other')
    mockedGetTrack.mockResolvedValue(fakeTrack())
    const res = await PATCH(patchRequest({ title: 'New' }), ctx())
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('OWNERSHIP_REQUIRED')
    expect(mockedUpdateTrack).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE when participant edits in STAGE2', async () => {
    participantHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE2') as any)
    mockedGetTrack.mockResolvedValue(fakeTrack())
    const res = await PATCH(patchRequest({ title: 'New' }), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
    expect(mockedUpdateTrack).not.toHaveBeenCalled()
  })

  it('admin can edit in STAGE2 (override)', async () => {
    adminHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE2') as any)
    mockedGetTrack.mockResolvedValue(
      fakeTrack({ submittedBy: { id: 'p_other', displayName: null } }),
    )
    mockedUpdateTrack.mockResolvedValue(
      fakeTrack({ title: 'Moderated', submittedBy: { id: 'p_other', displayName: null } }),
    )
    const res = await PATCH(patchRequest({ title: 'Moderated' }), ctx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<TrackPublic>
    expect(body.data.title).toBe('Moderated')
    // Admin override: ownerId passed = the existing track owner.
    expect(mockedUpdateTrack).toHaveBeenCalledWith('t_1', 'p_other', { title: 'Moderated' })
  })

  it('participant edits own track in STAGE1: returns 200 with updated track', async () => {
    participantHeaders()
    mockedGetTrack.mockResolvedValue(fakeTrack())
    mockedUpdateTrack.mockResolvedValue(fakeTrack({ title: 'New' }))
    const res = await PATCH(patchRequest({ title: '  New  ' }), ctx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<TrackPublic>
    expect(body.data.title).toBe('New')
    expect(mockedUpdateTrack).toHaveBeenCalledWith('t_1', 'p_1', { title: 'New' })
  })

  it('returns 400 INVALID_INPUT when patch body has no fields', async () => {
    participantHeaders()
    mockedGetTrack.mockResolvedValue(fakeTrack())
    const res = await PATCH(patchRequest({}), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedUpdateTrack).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT for an unknown field (strict)', async () => {
    participantHeaders()
    mockedGetTrack.mockResolvedValue(fakeTrack())
    const res = await PATCH(patchRequest({ nope: 'x' }), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    participantHeaders()
    mockedGetTrack.mockResolvedValue(fakeTrack())
    const req = new Request('https://example.test/api/tracks/t_1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    })
    const res = await PATCH(req, ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })
})

describe('DELETE /api/tracks/:id', () => {
  it('returns 401 UNAUTHORIZED with no auth', async () => {
    setHeaders({})
    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(401)
    expect(mockedDeleteTrack).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when the track does not exist', async () => {
    participantHeaders()
    mockedGetTrack.mockResolvedValue(null)
    const res = await DELETE(deleteRequest(), ctx('t_missing'))
    expect(res.status).toBe(404)
    expect(mockedDeleteTrack).not.toHaveBeenCalled()
  })

  it('returns 403 OWNERSHIP_REQUIRED when participant does not own track', async () => {
    participantHeaders('p_other')
    mockedGetTrack.mockResolvedValue(fakeTrack())
    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('OWNERSHIP_REQUIRED')
    expect(mockedDeleteTrack).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_STAGE when participant deletes in STAGE2', async () => {
    participantHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE2') as any)
    mockedGetTrack.mockResolvedValue(fakeTrack())
    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
    expect(mockedDeleteTrack).not.toHaveBeenCalled()
  })

  it('participant deletes own track in STAGE1: returns 200', async () => {
    participantHeaders()
    mockedGetTrack.mockResolvedValue(fakeTrack())
    mockedDeleteTrack.mockResolvedValue(true)
    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(200)
    expect(mockedDeleteTrack).toHaveBeenCalledWith('t_1', 'p_1')
  })

  it('admin deletes any track in STAGE2: returns 200 and uses null ownerId (so cascade delete still scopes by id)', async () => {
    adminHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE2') as any)
    mockedGetTrack.mockResolvedValue(
      fakeTrack({ submittedBy: { id: 'p_other', displayName: null } }),
    )
    mockedDeleteTrack.mockResolvedValue(true)
    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(200)
    expect(mockedDeleteTrack).toHaveBeenCalledWith('t_1', null)
  })

  it('returns 404 NOT_FOUND when delete fails (race)', async () => {
    participantHeaders()
    mockedGetTrack.mockResolvedValue(fakeTrack())
    mockedDeleteTrack.mockResolvedValue(false)
    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(404)
  })
})
