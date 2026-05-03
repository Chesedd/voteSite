import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies'
import { _resetAll } from '@/lib/auth/rate-limit'

vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  verifyPassword: vi.fn(),
}))

import { POST } from './route'
import { getActiveSession } from '@/db/repos/session'
import { verifyPassword } from '@/lib/crypto'

const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedVerifyPassword = vi.mocked(verifyPassword)

const TEST_SECRET = 'a'.repeat(48)
const TEST_IP = '203.0.113.7'

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Test',
    stage: 'SETUP',
    adminPasswordHash: '$2b$10$fakeFakeFakeFakeFakeFu',
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SessionRow
}

function makeRequest(body: unknown, ip: string = TEST_IP): Request {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-forwarded-for': ip,
  })
  return new Request('https://example.test/api/auth/admin', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', TEST_SECRET)
  _resetAll()
  mockedGetActiveSession.mockReset()
  mockedVerifyPassword.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/auth/admin', () => {
  it('returns 400 INVALID_INPUT when password is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    // No DB or password check should have run.
    expect(mockedGetActiveSession).not.toHaveBeenCalled()
    expect(mockedVerifyPassword).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when password is empty string', async () => {
    const res = await POST(makeRequest({ password: '' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 404 NOT_FOUND when no active session exists', async () => {
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ password: 'whatever' }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedVerifyPassword).not.toHaveBeenCalled()
  })

  it('returns 401 INVALID_PASSWORD on a wrong password and records one failure', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedVerifyPassword.mockResolvedValue(false)

    const res = await POST(makeRequest({ password: 'wrong' }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_PASSWORD')
    expect(mockedVerifyPassword).toHaveBeenCalledTimes(1)
    // Cookie must NOT be set on a failed login.
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 401 on the 5th wrong attempt and 429 RATE_LIMITED on the 6th', async () => {
    // Boundary choice: the 5th wrong attempt itself returns 401 — the lockout
    // is set as a side effect of that 5th recordFailure, and only takes effect
    // on the *next* request. The 6th request gets 429.
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedVerifyPassword.mockResolvedValue(false)

    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest({ password: 'wrong' }))
      expect(res.status).toBe(401)
    }
    const sixth = await POST(makeRequest({ password: 'wrong' }))
    expect(sixth.status).toBe(429)
    const body = (await sixth.json()) as ApiError
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('returns 200 with a session_token cookie on the right password', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedVerifyPassword.mockResolvedValue(true)

    const res = await POST(makeRequest({ password: 'correct-horse-battery-staple' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<Record<string, never>>
    expect(body).toEqual({ ok: true, data: {} })

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Path=\//i)
    expect(setCookie).toMatch(/SameSite=lax/i)
  })

  it('clears accumulated failures on a successful login', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())

    // 4 wrong attempts — under the lockout threshold.
    mockedVerifyPassword.mockResolvedValue(false)
    for (let i = 0; i < 4; i++) {
      const res = await POST(makeRequest({ password: 'wrong' }))
      expect(res.status).toBe(401)
    }

    // Right attempt — should succeed AND wipe the bucket.
    mockedVerifyPassword.mockResolvedValue(true)
    const ok = await POST(makeRequest({ password: 'right' }))
    expect(ok.status).toBe(200)

    // Now fail once more from the same IP — must be 401 (fresh count), not 429.
    mockedVerifyPassword.mockResolvedValue(false)
    const after = await POST(makeRequest({ password: 'wrong' }))
    expect(after.status).toBe(401)
  })

  it('returns 429 even when the password is correct, if the IP is currently locked', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())

    // Burn through 5 wrong attempts — last one triggers the lockout.
    mockedVerifyPassword.mockResolvedValue(false)
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest({ password: 'wrong' }))
    }

    // Now try the right password — must still be rejected.
    mockedVerifyPassword.mockResolvedValue(true)
    const res = await POST(makeRequest({ password: 'right' }))
    expect(res.status).toBe(429)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('uses an unknown-IP bucket when x-forwarded-for is absent', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedVerifyPassword.mockResolvedValue(false)

    const headers = new Headers({ 'content-type': 'application/json' })
    const req = new Request('https://example.test/api/auth/admin', {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: 'wrong' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'x-forwarded-for': TEST_IP,
    })
    const req = new Request('https://example.test/api/auth/admin', {
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
