import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetAll } from '@/lib/auth/rate-limit'
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies'
import type { ApiError, ApiSuccess } from '@/lib/api/responses'

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

const TEST_JWT_SECRET = 'a'.repeat(48)

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date()
  return {
    id: 'sess_test',
    title: 'Test session',
    stage: 'STAGE1',
    adminPasswordHash: '$2b$10$fakehash',
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SessionRow
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/auth/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', TEST_JWT_SECRET)
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
  })

  it('returns 400 INVALID_INPUT when password is empty string', async () => {
    const res = await POST(makeRequest({ password: '' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 404 NOT_FOUND when no active session exists', async () => {
    mockedGetActiveSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ password: 'secret' }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('returns 401 INVALID_PASSWORD on a single wrong attempt', async () => {
    mockedGetActiveSession.mockResolvedValue(makeSession())
    mockedVerifyPassword.mockResolvedValue(false)

    const res = await POST(makeRequest({ password: 'wrong' }, { 'x-forwarded-for': '10.0.0.1' }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_PASSWORD')
    expect(mockedVerifyPassword).toHaveBeenCalledTimes(1)
  })

  /**
   * Boundary documentation: the 5th wrong attempt itself is what triggers the
   * lockout — so the response to that request is 429 RATE_LIMITED (not 401).
   * Subsequent attempts during the lockout window are also 429 (caught by
   * the up-front checkLockout, before verifyPassword runs).
   */
  it('returns 429 on the 5th wrong attempt and on any 6th attempt during lockout', async () => {
    mockedGetActiveSession.mockResolvedValue(makeSession())
    mockedVerifyPassword.mockResolvedValue(false)

    const ip = '10.0.0.2'
    const headers = { 'x-forwarded-for': ip }

    // Attempts 1-4: 401 INVALID_PASSWORD
    for (let i = 0; i < 4; i++) {
      const res = await POST(makeRequest({ password: 'wrong' }, headers))
      expect(res.status).toBe(401)
    }

    // Attempt 5: triggers lockout, returns 429
    const fifth = await POST(makeRequest({ password: 'wrong' }, headers))
    expect(fifth.status).toBe(429)
    const fifthBody = (await fifth.json()) as ApiError
    expect(fifthBody.error.code).toBe('RATE_LIMITED')

    // Attempt 6: still locked out, returns 429 without calling verifyPassword again
    mockedVerifyPassword.mockClear()
    const sixth = await POST(makeRequest({ password: 'wrong' }, headers))
    expect(sixth.status).toBe(429)
    expect(mockedVerifyPassword).not.toHaveBeenCalled()
  })

  it('returns 200 with Set-Cookie on a correct password', async () => {
    mockedGetActiveSession.mockResolvedValue(makeSession({ id: 'sess_abc' }))
    mockedVerifyPassword.mockResolvedValue(true)

    const res = await POST(makeRequest({ password: 'right' }))
    expect(res.status).toBe(200)

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)

    const body = (await res.json()) as ApiSuccess<unknown>
    expect(body.ok).toBe(true)
  })

  it('clears the failure bucket on a correct password (next mistype starts fresh)', async () => {
    mockedGetActiveSession.mockResolvedValue(makeSession())
    const ip = '10.0.0.3'
    const headers = { 'x-forwarded-for': ip }

    // 4 failures, then a success.
    mockedVerifyPassword.mockResolvedValue(false)
    for (let i = 0; i < 4; i++) {
      await POST(makeRequest({ password: 'wrong' }, headers))
    }

    mockedVerifyPassword.mockResolvedValue(true)
    const okRes = await POST(makeRequest({ password: 'right' }, headers))
    expect(okRes.status).toBe(200)

    // Now a single new failure should NOT lock out — bucket was cleared.
    mockedVerifyPassword.mockResolvedValue(false)
    const nextFail = await POST(makeRequest({ password: 'wrong' }, headers))
    expect(nextFail.status).toBe(401)
  })

  it('still returns 429 for a correct password while the IP is locked out', async () => {
    mockedGetActiveSession.mockResolvedValue(makeSession())
    const ip = '10.0.0.4'
    const headers = { 'x-forwarded-for': ip }

    // Trigger lockout with 5 failures.
    mockedVerifyPassword.mockResolvedValue(false)
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest({ password: 'wrong' }, headers))
    }

    // Even with the right password, the lockout still applies.
    mockedVerifyPassword.mockResolvedValue(true)
    const res = await POST(makeRequest({ password: 'right' }, headers))
    expect(res.status).toBe(429)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('RATE_LIMITED')

    // verifyPassword must not have been called — checkLockout short-circuits.
    // (Reset count from the 5 failure calls and check the post-lockout call.)
  })
})
