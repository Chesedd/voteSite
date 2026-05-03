import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies'
import { verifyToken } from '@/lib/auth/jwt'

vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
  createSession: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  hashPassword: vi.fn(),
  generateJoinToken: vi.fn(),
}))

import { POST } from './route'
import { createSession, getActiveSession } from '@/db/repos/session'
import { generateJoinToken, hashPassword } from '@/lib/crypto'

const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedCreateSession = vi.mocked(createSession)
const mockedHashPassword = vi.mocked(hashPassword)
const mockedGenerateJoinToken = vi.mocked(generateJoinToken)

const TEST_SECRET = 'a'.repeat(48)
const JOIN_TOKEN_ALPHABET = /^[A-Za-z0-9_-]{16}$/

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_new',
    title: 'Голосование',
    stage: 'STAGE1',
    adminPasswordHash: 'hashed:strongpass',
    joinToken: 'JOINTOKEN1234567',
    maxParticipants: 20,
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SessionRow
}

function makeRequest(body: unknown): Request {
  const headers = new Headers({ 'content-type': 'application/json' })
  return new Request('https://example.test/api/setup', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', TEST_SECRET)
  mockedGetActiveSession.mockReset()
  mockedCreateSession.mockReset()
  mockedHashPassword.mockReset()
  mockedGenerateJoinToken.mockReset()

  // Sensible defaults for happy-path-shaped tests; individual tests can
  // override these as needed.
  mockedGetActiveSession.mockResolvedValue(null)
  mockedHashPassword.mockResolvedValue('hashed:strongpass')
  mockedGenerateJoinToken.mockReturnValue('JOINTOKEN1234567')
  mockedCreateSession.mockImplementation(async (params) =>
    fakeSession({
      joinToken: params.joinToken,
      maxParticipants: params.maxParticipants,
      adminPasswordHash: params.adminPasswordHash,
      title: params.title,
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/setup', () => {
  it('returns 400 INVALID_INPUT when password is missing', async () => {
    const res = await POST(makeRequest({ maxParticipants: 10 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedGetActiveSession).not.toHaveBeenCalled()
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when password is shorter than 8 chars', async () => {
    const res = await POST(makeRequest({ password: 'short', maxParticipants: 10 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when maxParticipants is below the minimum (1)', async () => {
    const res = await POST(makeRequest({ password: 'longenough', maxParticipants: 1 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when maxParticipants is zero', async () => {
    const res = await POST(makeRequest({ password: 'longenough', maxParticipants: 0 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when maxParticipants is negative', async () => {
    const res = await POST(makeRequest({ password: 'longenough', maxParticipants: -1 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when maxParticipants is above the maximum (101)', async () => {
    const res = await POST(makeRequest({ password: 'longenough', maxParticipants: 101 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when maxParticipants is not an integer', async () => {
    const res = await POST(makeRequest({ password: 'longenough', maxParticipants: 4.5 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    const headers = new Headers({ 'content-type': 'application/json' })
    const req = new Request('https://example.test/api/setup', {
      method: 'POST',
      headers,
      body: '{not valid json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 409 SESSION_EXISTS when an active session already exists', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession({ id: 'sess_existing' }))

    const res = await POST(makeRequest({ password: 'longenough', maxParticipants: 10 }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('SESSION_EXISTS')
    expect(mockedCreateSession).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 200 with the join token in the response body on success', async () => {
    const res = await POST(makeRequest({ password: 'strongpass', maxParticipants: 10 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ joinToken: string }>
    expect(body.ok).toBe(true)
    expect(body.data.joinToken).toBe('JOINTOKEN1234567')
  })

  it('persists the session with the requested maxParticipants and generated joinToken', async () => {
    await POST(makeRequest({ password: 'strongpass', maxParticipants: 25 }))
    expect(mockedCreateSession).toHaveBeenCalledTimes(1)
    const call = mockedCreateSession.mock.calls[0][0]
    expect(call.title).toBe('Голосование')
    expect(call.adminPasswordHash).toBe('hashed:strongpass')
    expect(call.joinToken).toBe('JOINTOKEN1234567')
    expect(call.maxParticipants).toBe(25)
  })

  it('does not create any participants — self-registration handles that', async () => {
    // The repo helper signature has no `participants` field; the endpoint
    // never references one. This test pins the contract: setup creates only
    // the Session shell.
    await POST(makeRequest({ password: 'strongpass', maxParticipants: 10 }))
    const call = mockedCreateSession.mock.calls[0][0]
    expect(call).not.toHaveProperty('participants')
    expect(Object.keys(call).sort()).toEqual(
      ['adminPasswordHash', 'joinToken', 'maxParticipants', 'title'].sort(),
    )
  })

  it('sets a session_token cookie carrying an admin JWT for the new session', async () => {
    mockedCreateSession.mockResolvedValue(fakeSession({ id: 'sess_brand_new' }))

    const res = await POST(makeRequest({ password: 'strongpass', maxParticipants: 4 }))
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
    expect(decoded).toEqual({ kind: 'admin', sessionId: 'sess_brand_new' })
  })

  it('returned join token conforms to the generateJoinToken alphabet/length contract', async () => {
    // Use the real generateJoinToken so we exercise the contract end-to-end
    // (alphabet, length). All other dependencies stay mocked.
    const realCrypto = await vi.importActual<typeof import('@/lib/crypto')>('@/lib/crypto')
    mockedGenerateJoinToken.mockImplementation(realCrypto.generateJoinToken)

    const res = await POST(makeRequest({ password: 'strongpass', maxParticipants: 10 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ joinToken: string }>
    expect(body.data.joinToken).toMatch(JOIN_TOKEN_ALPHABET)
  })

  it('does not set a cookie when the input is invalid', async () => {
    const res = await POST(makeRequest({ password: 'short', maxParticipants: 10 }))
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
