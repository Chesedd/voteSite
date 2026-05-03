import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, ApiSuccess } from '@/lib/api/responses'
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies'
import { verifyToken } from '@/lib/auth/jwt'

vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
  createSessionWithParticipants: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  hashPassword: vi.fn(),
  hashKey: vi.fn(),
  generateAccessKey: vi.fn(),
}))

import { POST } from './route'
import { createSessionWithParticipants, getActiveSession } from '@/db/repos/session'
import { generateAccessKey, hashKey, hashPassword } from '@/lib/crypto'

const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedCreateSession = vi.mocked(createSessionWithParticipants)
const mockedHashPassword = vi.mocked(hashPassword)
const mockedHashKey = vi.mocked(hashKey)
const mockedGenerateAccessKey = vi.mocked(generateAccessKey)

const TEST_SECRET = 'a'.repeat(48)
const ACCESS_KEY_ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_new',
    title: 'Голосование',
    stage: 'STAGE1',
    adminPasswordHash: 'hashed:strongpass',
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
  mockedHashKey.mockReset()
  mockedGenerateAccessKey.mockReset()

  // Sensible defaults for happy-path-shaped tests; individual tests can
  // override these as needed.
  mockedGetActiveSession.mockResolvedValue(null)
  mockedHashPassword.mockResolvedValue('hashed:strongpass')
  mockedHashKey.mockImplementation((plain: string) => `hash(${plain})`)
  let counter = 0
  mockedGenerateAccessKey.mockImplementation(() => {
    counter += 1
    // 8-char strings drawn from the access-key alphabet.
    const seed = `ABCDEFGH`
    const c = ACCESS_KEY_ALPHABET.test(seed) ? seed : 'ABCDEFGH'
    return `${c.slice(0, 7)}${'23456789'[counter % 8]}`
  })
  mockedCreateSession.mockResolvedValue(fakeSession())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/setup', () => {
  it('returns 400 INVALID_INPUT when password is missing', async () => {
    const res = await POST(makeRequest({ participantCount: 5 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedGetActiveSession).not.toHaveBeenCalled()
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when password is shorter than 8 chars', async () => {
    const res = await POST(makeRequest({ password: 'short', participantCount: 5 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when participantCount is below the minimum (1)', async () => {
    const res = await POST(makeRequest({ password: 'longenough', participantCount: 1 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when participantCount is above the maximum (31)', async () => {
    const res = await POST(makeRequest({ password: 'longenough', participantCount: 31 }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when participantCount is not an integer', async () => {
    const res = await POST(makeRequest({ password: 'longenough', participantCount: 4.5 }))
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

    const res = await POST(makeRequest({ password: 'longenough', participantCount: 5 }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('SESSION_EXISTS')
    expect(mockedCreateSession).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 200 with the requested number of access keys on success', async () => {
    const res = await POST(makeRequest({ password: 'strongpass', participantCount: 5 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ accessKeys: string[] }>
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data.accessKeys)).toBe(true)
    expect(body.data.accessKeys).toHaveLength(5)
    expect(mockedGenerateAccessKey).toHaveBeenCalledTimes(5)
  })

  it('persists the same hashed keys it derives from the generated plaintext keys', async () => {
    await POST(makeRequest({ password: 'strongpass', participantCount: 3 }))
    expect(mockedCreateSession).toHaveBeenCalledTimes(1)
    const call = mockedCreateSession.mock.calls[0][0]
    expect(call.title).toBe('Голосование')
    expect(call.adminPasswordHash).toBe('hashed:strongpass')
    expect(call.participantKeyHashes).toHaveLength(3)
    // Each persisted hash corresponds to a generated plaintext key, in order.
    const generated = mockedGenerateAccessKey.mock.results.map((r) => r.value as string)
    expect(call.participantKeyHashes).toEqual(generated.map((k) => `hash(${k})`))
  })

  it('sets a session_token cookie carrying an admin JWT for the new session', async () => {
    mockedCreateSession.mockResolvedValue(fakeSession({ id: 'sess_brand_new' }))

    const res = await POST(makeRequest({ password: 'strongpass', participantCount: 4 }))
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

  it('returned access keys conform to the generateAccessKey alphabet/length contract', async () => {
    // Use the real generateAccessKey for this case so we exercise the contract
    // end-to-end (alphabet, length). All other dependencies stay mocked.
    const realCrypto = await vi.importActual<typeof import('@/lib/crypto')>('@/lib/crypto')
    mockedGenerateAccessKey.mockImplementation(realCrypto.generateAccessKey)

    const res = await POST(makeRequest({ password: 'strongpass', participantCount: 6 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ accessKeys: string[] }>
    expect(body.data.accessKeys).toHaveLength(6)
    for (const key of body.data.accessKeys) {
      expect(key).toMatch(ACCESS_KEY_ALPHABET)
    }
  })

  it('does not set a cookie when the input is invalid', async () => {
    const res = await POST(makeRequest({ password: 'short', participantCount: 5 }))
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
