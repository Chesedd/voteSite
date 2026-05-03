import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies'
import { _resetAll } from '@/lib/auth/rate-limit'
import { verifyToken } from '@/lib/auth/jwt'

vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))
vi.mock('@/db/repos/participant', () => ({
  findParticipantByKeyHash: vi.fn(),
  markParticipantJoined: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  hashKey: vi.fn(),
}))

import { POST } from './route'
import { getActiveSession } from '@/db/repos/session'
import { findParticipantByKeyHash, markParticipantJoined } from '@/db/repos/participant'
import { hashKey } from '@/lib/crypto'

const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedFindParticipant = vi.mocked(findParticipantByKeyHash)
const mockedMarkJoined = vi.mocked(markParticipantJoined)
const mockedHashKey = vi.mocked(hashKey)

const TEST_SECRET = 'a'.repeat(48)
const TEST_IP = '203.0.113.7'
const VALID_KEY = 'ABCD2345' // 8 chars
const FAKE_HASH = 'deadbeef'.repeat(8) // 64 hex chars

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>
type ParticipantRow = NonNullable<Awaited<ReturnType<typeof findParticipantByKeyHash>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Test',
    stage: 'STAGE1',
    adminPasswordHash: '$2b$10$fakeFakeFakeFakeFakeFu',
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SessionRow
}

function fakeParticipant(overrides: Partial<ParticipantRow> = {}): ParticipantRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'p_1',
    sessionId: 'sess_1',
    accessKeyHash: FAKE_HASH,
    displayName: 'Алиса',
    hasJoined: false,
    lastSeenAt: null,
    createdAt: now,
    ...overrides,
  } as ParticipantRow
}

function makeRequest(body: unknown, ip: string = TEST_IP): Request {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-forwarded-for': ip,
  })
  return new Request('https://example.test/api/auth/participant', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', TEST_SECRET)
  _resetAll()
  mockedGetActiveSession.mockReset()
  mockedFindParticipant.mockReset()
  mockedMarkJoined.mockReset()
  mockedHashKey.mockReset()
  mockedHashKey.mockReturnValue(FAKE_HASH)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/auth/participant', () => {
  it('returns 400 INVALID_INPUT when accessKey is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedGetActiveSession).not.toHaveBeenCalled()
    expect(mockedFindParticipant).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when accessKey is empty', async () => {
    const res = await POST(makeRequest({ accessKey: '' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT when accessKey is too short (7 chars)', async () => {
    const res = await POST(makeRequest({ accessKey: 'ABCD234' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedFindParticipant).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when accessKey is too long (9 chars)', async () => {
    const res = await POST(makeRequest({ accessKey: 'ABCD23456' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 404 NOT_FOUND when no active session exists', async () => {
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedFindParticipant).not.toHaveBeenCalled()
  })

  it('returns 401 INVALID_KEY on lookup miss and records one failure', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedFindParticipant.mockResolvedValue(null)

    const res = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_KEY')
    expect(mockedFindParticipant).toHaveBeenCalledWith('sess_1', FAKE_HASH)
    expect(mockedMarkJoined).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 401 on the 5th wrong key and 429 RATE_LIMITED on the 6th', async () => {
    // Boundary mirrors the admin endpoint exactly: the 5th wrong attempt itself
    // returns 401 and as a side effect arms the lockout. Only the 6th request
    // — which arrives in a locked window — gets 429.
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedFindParticipant.mockResolvedValue(null)

    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest({ accessKey: VALID_KEY }))
      expect(res.status).toBe(401)
    }
    const sixth = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(sixth.status).toBe(429)
    const body = (await sixth.json()) as ApiError
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('returns 200 with participant id and displayName on lookup hit', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedFindParticipant.mockResolvedValue(fakeParticipant({ id: 'p_42', displayName: 'Боб' }))
    mockedMarkJoined.mockResolvedValue(fakeParticipant({ id: 'p_42', displayName: 'Боб' }))

    const res = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{
      participant: { id: string; displayName: string | null }
    }>
    expect(body).toEqual({
      ok: true,
      data: { participant: { id: 'p_42', displayName: 'Боб' } },
    })
  })

  it('propagates a null displayName as null (does not coerce to empty string)', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedFindParticipant.mockResolvedValue(fakeParticipant({ id: 'p_anon', displayName: null }))
    mockedMarkJoined.mockResolvedValue(fakeParticipant({ id: 'p_anon', displayName: null }))

    const res = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{
      participant: { id: string; displayName: string | null }
    }>
    expect(body.data.participant).toEqual({ id: 'p_anon', displayName: null })
  })

  it('calls markParticipantJoined with the matched participant id on success', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedFindParticipant.mockResolvedValue(fakeParticipant({ id: 'p_42' }))
    mockedMarkJoined.mockResolvedValue(fakeParticipant({ id: 'p_42' }))

    const res = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(res.status).toBe(200)
    expect(mockedMarkJoined).toHaveBeenCalledTimes(1)
    expect(mockedMarkJoined).toHaveBeenCalledWith('p_42')
  })

  it('sets a session_token cookie whose JWT decodes to participant kind with matching ids', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession({ id: 'sess_xyz' }))
    mockedFindParticipant.mockResolvedValue(fakeParticipant({ id: 'p_99' }))
    mockedMarkJoined.mockResolvedValue(fakeParticipant({ id: 'p_99' }))

    const res = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(res.status).toBe(200)

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Path=\//i)
    expect(setCookie).toMatch(/SameSite=lax/i)

    const tokenMatch = /session_token=([^;]+)/.exec(setCookie ?? '')
    expect(tokenMatch).not.toBeNull()
    const token = decodeURIComponent(tokenMatch![1])
    const decoded = await verifyToken(token)
    expect(decoded).toEqual({
      kind: 'participant',
      sessionId: 'sess_xyz',
      participantId: 'p_99',
    })
  })

  it('clears the rate-limit bucket on a successful login (next failure is 401, not 429)', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())

    // 4 wrong attempts — under the lockout threshold.
    mockedFindParticipant.mockResolvedValue(null)
    for (let i = 0; i < 4; i++) {
      const res = await POST(makeRequest({ accessKey: VALID_KEY }))
      expect(res.status).toBe(401)
    }

    // Right key — should succeed AND wipe the bucket.
    mockedFindParticipant.mockResolvedValue(fakeParticipant())
    mockedMarkJoined.mockResolvedValue(fakeParticipant())
    const success = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(success.status).toBe(200)

    // Now miss again from the same IP — must be 401 (fresh count), not 429.
    mockedFindParticipant.mockResolvedValue(null)
    const after = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(after.status).toBe(401)
  })

  it('returns 429 even on a correct key if the IP is currently locked', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())

    // Burn 5 wrong attempts to arm the lockout.
    mockedFindParticipant.mockResolvedValue(null)
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest({ accessKey: VALID_KEY }))
    }

    // Now offer the right key — must still be rejected, no cookie, no DB write.
    mockedFindParticipant.mockResolvedValue(fakeParticipant())
    const res = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(res.status).toBe(429)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(mockedMarkJoined).not.toHaveBeenCalled()
  })

  it('returns 500 INTERNAL_ERROR if markParticipantJoined throws (no cookie issued)', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedFindParticipant.mockResolvedValue(fakeParticipant())
    mockedMarkJoined.mockRejectedValue(new Error('db down'))

    const res = await POST(makeRequest({ accessKey: VALID_KEY }))
    expect(res.status).toBe(500)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'x-forwarded-for': TEST_IP,
    })
    const req = new Request('https://example.test/api/auth/participant', {
      method: 'POST',
      headers,
      body: '{not valid json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })
})
