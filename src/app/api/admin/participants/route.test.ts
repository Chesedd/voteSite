import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/participant', () => ({
  countParticipants: vi.fn(),
  createParticipants: vi.fn(),
  listParticipants: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  generateAccessKey: vi.fn(),
  hashKey: vi.fn(),
}))

import { headers } from 'next/headers'
import { GET, POST } from './route'
import {
  countParticipants,
  createParticipants,
  listParticipants,
  type ParticipantPublic,
} from '@/db/repos/participant'
import { generateAccessKey, hashKey } from '@/lib/crypto'

const mockedHeaders = vi.mocked(headers)
const mockedListParticipants = vi.mocked(listParticipants)
const mockedCountParticipants = vi.mocked(countParticipants)
const mockedCreateParticipants = vi.mocked(createParticipants)
const mockedGenerateAccessKey = vi.mocked(generateAccessKey)
const mockedHashKey = vi.mocked(hashKey)

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

function fakeParticipant(overrides: Partial<ParticipantPublic> = {}): ParticipantPublic {
  return {
    id: 'p_seed',
    displayName: null,
    hasJoined: false,
    lastSeenAt: null,
    createdAt: new Date('2026-05-03T00:00:00Z'),
    ...overrides,
  }
}

function makeJsonRequest(body: unknown): Request {
  return new Request('https://example.test/api/admin/participants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedListParticipants.mockReset()
  mockedCountParticipants.mockReset()
  mockedCreateParticipants.mockReset()
  mockedGenerateAccessKey.mockReset()
  mockedHashKey.mockReset()

  let counter = 0
  mockedGenerateAccessKey.mockImplementation(() => {
    counter += 1
    return `KEY${counter.toString().padStart(5, '0')}`
  })
  mockedHashKey.mockImplementation((plain: string) => `hash(${plain})`)
})

describe('GET /api/admin/participants', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await GET()
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedListParticipants).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    participantHeaders()
    const res = await GET()
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedListParticipants).not.toHaveBeenCalled()
  })

  it('returns the listing for the admin session, never including accessKeyHash', async () => {
    adminHeaders()
    mockedListParticipants.mockResolvedValue([
      fakeParticipant({ id: 'p_1', displayName: 'Аня', hasJoined: true }),
      fakeParticipant({ id: 'p_2' }),
    ])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<ParticipantPublic[]>
    expect(body.ok).toBe(true)
    expect(body.data).toHaveLength(2)
    for (const p of body.data) {
      expect(p).not.toHaveProperty('accessKeyHash')
      expect(p).not.toHaveProperty('sessionId')
    }
    expect(mockedListParticipants).toHaveBeenCalledWith('sess_1')
  })
})

describe('POST /api/admin/participants', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await POST(makeJsonRequest({ count: 2 }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedCreateParticipants).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    participantHeaders()
    const res = await POST(makeJsonRequest({ count: 2 }))
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedCreateParticipants).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when count is below 1', async () => {
    adminHeaders()
    const res = await POST(makeJsonRequest({ count: 0 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateParticipants).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when count is above 30', async () => {
    adminHeaders()
    const res = await POST(makeJsonRequest({ count: 31 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateParticipants).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when count is not an integer', async () => {
    adminHeaders()
    const res = await POST(makeJsonRequest({ count: 2.5 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 LIMIT_EXCEEDED when total would exceed 30', async () => {
    adminHeaders()
    mockedCountParticipants.mockResolvedValue(29)
    const res = await POST(makeJsonRequest({ count: 2 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('LIMIT_EXCEEDED')
    expect(mockedCreateParticipants).not.toHaveBeenCalled()
  })

  it('accepts up to 30 total participants exactly', async () => {
    adminHeaders()
    mockedCountParticipants.mockResolvedValue(28)
    mockedCreateParticipants.mockResolvedValue([])
    const res = await POST(makeJsonRequest({ count: 2 }))
    expect(res.status).toBe(200)
    expect(mockedCreateParticipants).toHaveBeenCalledTimes(1)
  })

  it('returns access keys and persists their hashes in order', async () => {
    adminHeaders()
    mockedCountParticipants.mockResolvedValue(0)
    mockedCreateParticipants.mockResolvedValue([])

    const res = await POST(makeJsonRequest({ count: 3 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ accessKeys: string[] }>
    expect(body.ok).toBe(true)
    expect(body.data.accessKeys).toHaveLength(3)

    const call = mockedCreateParticipants.mock.calls[0]
    expect(call[0]).toBe('sess_1')
    expect(call[1]).toEqual(body.data.accessKeys.map((k) => `hash(${k})`))
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    adminHeaders()
    const req = new Request('https://example.test/api/admin/participants', {
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
