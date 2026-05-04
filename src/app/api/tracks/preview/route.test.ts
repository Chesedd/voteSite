import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, ApiSuccess } from '@/lib/api/responses'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))

import { POST } from './route'
import { headers } from 'next/headers'
import { getActiveSession } from '@/db/repos/session'

const mockedHeaders = vi.mocked(headers)
const mockedGetActiveSession = vi.mocked(getActiveSession)

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

type PreviewData = {
  service: string | null
  serviceTrackId: string | null
  serviceAlbumId: string | null
  embedSupported: boolean
  suggestedTitle: string | null
  suggestedArtist: string | null
  coverUrl: string | null
}

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Test',
    stage: 'STAGE1',
    adminPasswordHash: 'hash',
    joinToken: 'TOKEN1234567ABCD',
    maxParticipants: 20,
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SessionRow
}

function setAuth(kind: 'admin' | 'participant' | null): void {
  if (kind === null) {
    const h = new Headers({})
    mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
    return
  }
  if (kind === 'admin') {
    const h = new Headers({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
    return
  }
  const h = new Headers({
    'x-auth-kind': 'participant',
    'x-auth-session-id': 'sess_1',
    'x-auth-participant-id': 'p_1',
  })
  mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
}

function makeRequest(body: unknown): Request {
  return new Request('https://example.test/api/tracks/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedGetActiveSession.mockReset()
  vi.unstubAllGlobals()
  setAuth('participant')
  mockedGetActiveSession.mockResolvedValue(fakeSession())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/tracks/preview', () => {
  it('returns 401 when no auth', async () => {
    setAuth(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('<html></html>')))

    const res = await POST(makeRequest({ url: 'https://music.yandex.ru/track/1' }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 FORBIDDEN when caller is admin', async () => {
    setAuth('admin')

    const res = await POST(makeRequest({ url: 'https://music.yandex.ru/track/1' }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 400 INVALID_STAGE when not in STAGE1', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession({ stage: 'STAGE2' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('<html></html>')))

    const res = await POST(makeRequest({ url: 'https://music.yandex.ru/track/1' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
  })

  it('returns 404 NOT_FOUND when no active session', async () => {
    mockedGetActiveSession.mockResolvedValue(null)

    const res = await POST(makeRequest({ url: 'https://music.yandex.ru/track/1' }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 INVALID_INPUT when url is empty', async () => {
    const res = await POST(makeRequest({ url: '' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT when url is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT when url is too long (>500)', async () => {
    const long = 'https://example.com/' + 'a'.repeat(500)
    const res = await POST(makeRequest({ url: long }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT on malformed JSON body', async () => {
    const req = new Request('https://example.test/api/tracks/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('detects Yandex URL and returns embedSupported=true with split title/artist', async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Imagine — John Lennon">
        <meta property="og:image" content="https://yandex/cover.jpg">
        <meta property="og:site_name" content="Яндекс Музыка">
      </head></html>
    `
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(html)))

    const res = await POST(makeRequest({ url: 'https://music.yandex.ru/album/10/track/20' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<PreviewData>
    expect(body.data).toEqual({
      service: 'yandex',
      serviceTrackId: '20',
      serviceAlbumId: '10',
      embedSupported: true,
      suggestedTitle: 'Imagine',
      suggestedArtist: 'John Lennon',
      coverUrl: 'https://yandex/cover.jpg',
    })
  })

  it('returns service=null and embedSupported=false for unparseable input but still includes any fetched metadata', async () => {
    const html = `<html><head><title>Some Page</title></head></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(html)))

    const res = await POST(makeRequest({ url: 'not-a-url' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<PreviewData>
    expect(body.data.service).toBeNull()
    expect(body.data.embedSupported).toBe(false)
    expect(body.data.serviceTrackId).toBeNull()
    // fetchOgMetadata will attempt the fetch — with our mock it returns "Some Page".
    // The endpoint propagates whatever metadata it can get.
    expect(body.data.suggestedTitle).toBe('Some Page')
  })

  it('returns service from URL parse + null metadata when OG fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    const res = await POST(makeRequest({ url: 'https://open.spotify.com/track/abc123' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<PreviewData>
    expect(body.data).toEqual({
      service: 'spotify',
      serviceTrackId: 'abc123',
      serviceAlbumId: null,
      embedSupported: true,
      suggestedTitle: null,
      suggestedArtist: null,
      coverUrl: null,
    })
  })

  it('falls back to og:site_name as suggestedArtist when title has no separator', async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Bohemian Rhapsody">
        <meta property="og:site_name" content="Spotify">
        <meta property="og:image" content="https://spotify/cover.jpg">
      </head></html>
    `
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(html)))

    const res = await POST(makeRequest({ url: 'https://open.spotify.com/track/xyz' }))
    const body = (await res.json()) as ApiSuccess<PreviewData>
    expect(body.data.suggestedTitle).toBe('Bohemian Rhapsody')
    expect(body.data.suggestedArtist).toBe('Spotify')
  })

  it('returns serviceAlbumId for Yandex /album/X/track/Y URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('<html></html>')))

    const res = await POST(makeRequest({ url: 'https://music.yandex.ru/album/123/track/456' }))
    const body = (await res.json()) as ApiSuccess<PreviewData>
    expect(body.data.service).toBe('yandex')
    expect(body.data.serviceTrackId).toBe('456')
    expect(body.data.serviceAlbumId).toBe('123')
  })

  it('returns null serviceAlbumId for Yandex /track/Y URLs without album', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('<html></html>')))

    const res = await POST(makeRequest({ url: 'https://music.yandex.ru/track/789' }))
    const body = (await res.json()) as ApiSuccess<PreviewData>
    expect(body.data.service).toBe('yandex')
    expect(body.data.serviceTrackId).toBe('789')
    expect(body.data.serviceAlbumId).toBeNull()
  })

  it('VK URL returns service=vk, embedSupported=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('<html></html>')))

    const res = await POST(makeRequest({ url: 'https://vk.com/audio12345_67890' }))
    const body = (await res.json()) as ApiSuccess<PreviewData>
    expect(body.data.service).toBe('vk')
    expect(body.data.embedSupported).toBe(false)
    expect(body.data.serviceTrackId).toBeNull()
  })
})
