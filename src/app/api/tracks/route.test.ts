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
  countTracksByParticipant: vi.fn(),
  createTrack: vi.fn(),
  listTracks: vi.fn(),
}))

import { headers } from 'next/headers'
import { GET, POST } from './route'
import { getActiveSession } from '@/db/repos/session'
import { countTracksByParticipant, createTrack, listTracks } from '@/db/repos/track'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedCount = vi.mocked(countTracksByParticipant)
const mockedCreate = vi.mocked(createTrack)
const mockedList = vi.mocked(listTracks)

function setHeaders(entries: Record<string, string>): void {
  const h = new Headers(entries)
  mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
}

function adminHeaders(): void {
  setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
}

function participantHeaders(): void {
  setHeaders({
    'x-auth-kind': 'participant',
    'x-auth-session-id': 'sess_1',
    'x-auth-participant-id': 'p_1',
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

function postRequest(body: unknown): Request {
  return new Request('https://example.test/api/tracks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  mockedCount.mockReset()
  mockedCreate.mockReset()
  mockedList.mockReset()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE1') as any)
  mockedCount.mockResolvedValue(0)
})

describe('GET /api/tracks', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await GET()
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedList).not.toHaveBeenCalled()
  })

  it('returns the pool to a participant', async () => {
    participantHeaders()
    mockedList.mockResolvedValue([fakeTrack(), fakeTrack({ id: 't_2', title: 'Other' })])
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<TrackPublic[]>
    expect(body.data).toHaveLength(2)
    expect(mockedList).toHaveBeenCalledWith('sess_1')
  })

  it('returns the pool to an admin too', async () => {
    adminHeaders()
    mockedList.mockResolvedValue([fakeTrack()])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(mockedList).toHaveBeenCalledWith('sess_1')
  })
})

describe('POST /api/tracks', () => {
  it('returns 401 UNAUTHORIZED with no auth', async () => {
    setHeaders({})
    const res = await POST(postRequest({ title: 'Song' }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is an admin', async () => {
    adminHeaders()
    const res = await POST(postRequest({ title: 'Song' }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when there is no active session', async () => {
    participantHeaders()
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await POST(postRequest({ title: 'Song' }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 INVALID_STAGE when stage is not STAGE1', async () => {
    participantHeaders()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedGetActiveSession.mockResolvedValue(fakeSession('STAGE2') as any)
    const res = await POST(postRequest({ title: 'Song' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when title is missing', async () => {
    participantHeaders()
    const res = await POST(postRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when title is too long', async () => {
    participantHeaders()
    const res = await POST(postRequest({ title: 'a'.repeat(121) }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for an invalid url', async () => {
    participantHeaders()
    const res = await POST(postRequest({ title: 'Song', url: 'not-a-url' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for an unknown service', async () => {
    participantHeaders()
    const res = await POST(postRequest({ title: 'Song', service: 'tidal' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 LIMIT_EXCEEDED on the 4th track', async () => {
    participantHeaders()
    mockedCount.mockResolvedValue(3)
    const res = await POST(postRequest({ title: 'Fourth' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('LIMIT_EXCEEDED')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('happy path: creates a track and returns the public shape (embedSupported defaults false)', async () => {
    participantHeaders()
    mockedCreate.mockResolvedValue(fakeTrack({ title: 'Song', embedSupported: false }))
    const res = await POST(postRequest({ title: '  Song  ' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<TrackPublic>
    expect(body.data.title).toBe('Song')
    expect(body.data.embedSupported).toBe(false)
    expect(body.data.submittedBy).toEqual({ id: 'p_1', displayName: 'Аня' })
    const call = mockedCreate.mock.calls[0][0]
    // Title is trimmed by zod transform.
    expect(call.title).toBe('Song')
    expect(call.sessionId).toBe('sess_1')
    expect(call.submittedById).toBe('p_1')
    expect(call.embedSupported).toBe(false)
  })

  it('happy path: accepts every optional field populated', async () => {
    participantHeaders()
    mockedCreate.mockResolvedValue(
      fakeTrack({
        title: 'Song',
        artist: 'Artist',
        url: 'https://music.yandex.ru/track/1',
        description: 'desc',
        service: 'yandex',
        serviceTrackId: '1',
        coverUrl: 'https://avatars.example/cover.jpg',
        embedSupported: true,
      }),
    )
    const res = await POST(
      postRequest({
        title: 'Song',
        artist: 'Artist',
        url: 'https://music.yandex.ru/track/1',
        description: 'desc',
        service: 'yandex',
        serviceTrackId: '1',
        coverUrl: 'https://avatars.example/cover.jpg',
        embedSupported: true,
      }),
    )
    expect(res.status).toBe(200)
    const call = mockedCreate.mock.calls[0][0]
    expect(call).toMatchObject({
      title: 'Song',
      artist: 'Artist',
      url: 'https://music.yandex.ru/track/1',
      description: 'desc',
      service: 'yandex',
      serviceTrackId: '1',
      coverUrl: 'https://avatars.example/cover.jpg',
      embedSupported: true,
    })
  })

  it('normalises empty optional strings to null before persisting', async () => {
    participantHeaders()
    mockedCreate.mockResolvedValue(fakeTrack())
    const res = await POST(
      postRequest({ title: 'Song', artist: '', description: '', url: '', coverUrl: '' }),
    )
    expect(res.status).toBe(200)
    const call = mockedCreate.mock.calls[0][0]
    expect(call.artist).toBeNull()
    expect(call.description).toBeNull()
    expect(call.url).toBeNull()
    expect(call.coverUrl).toBeNull()
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    participantHeaders()
    const req = new Request('https://example.test/api/tracks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })
})
