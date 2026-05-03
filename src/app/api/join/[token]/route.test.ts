import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'

vi.mock('@/db/client', () => ({
  prisma: {
    // The route uses prisma.$transaction(async (tx) => ...) — invoke the
    // callback with a stub tx so the helpers below get a non-undefined arg
    // matching their signature. The helpers themselves are mocked, so the
    // tx value isn't actually exercised.
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}))
vi.mock('@/db/repos/session', () => ({
  findSessionByJoinToken: vi.fn(),
}))
vi.mock('@/db/repos/participant', () => ({
  countParticipants: vi.fn(),
  createParticipantSelfRegistered: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  generateAccessKey: vi.fn(),
  hashKey: vi.fn(),
}))

import { POST } from './route'
import { findSessionByJoinToken } from '@/db/repos/session'
import { countParticipants, createParticipantSelfRegistered } from '@/db/repos/participant'
import { generateAccessKey, hashKey } from '@/lib/crypto'

const mockedFindSession = vi.mocked(findSessionByJoinToken)
const mockedCountParticipants = vi.mocked(countParticipants)
const mockedCreateParticipant = vi.mocked(createParticipantSelfRegistered)
const mockedGenerateAccessKey = vi.mocked(generateAccessKey)
const mockedHashKey = vi.mocked(hashKey)

const TEST_TOKEN = 'JOINTOKEN1234567'

type SessionRow = NonNullable<Awaited<ReturnType<typeof findSessionByJoinToken>>>

function fakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Голосование',
    stage: 'STAGE1',
    adminPasswordHash: '$2b$10$fakeFakeFakeFakeFakeFu',
    joinToken: TEST_TOKEN,
    maxParticipants: 5,
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SessionRow
}

function makeRequest(body: unknown): Request {
  return new Request(`https://example.test/api/join/${TEST_TOKEN}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function makeContext(token: string = TEST_TOKEN) {
  return { params: Promise.resolve({ token }) }
}

beforeEach(() => {
  mockedFindSession.mockReset()
  mockedCountParticipants.mockReset()
  mockedCreateParticipant.mockReset()
  mockedGenerateAccessKey.mockReset()
  mockedHashKey.mockReset()

  mockedGenerateAccessKey.mockReturnValue('ABCD2345')
  mockedHashKey.mockReturnValue('hash:ABCD2345')
})

describe('POST /api/join/[token]', () => {
  it('returns 400 INVALID_INPUT when displayName is missing', async () => {
    mockedFindSession.mockResolvedValue(fakeSession())
    const res = await POST(makeRequest({}), makeContext())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateParticipant).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when displayName is empty after trim', async () => {
    mockedFindSession.mockResolvedValue(fakeSession())
    const res = await POST(makeRequest({ displayName: '   ' }), makeContext())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateParticipant).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when displayName is too long (41 chars)', async () => {
    mockedFindSession.mockResolvedValue(fakeSession())
    const res = await POST(makeRequest({ displayName: 'A'.repeat(41) }), makeContext())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedCreateParticipant).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    const req = new Request(`https://example.test/api/join/${TEST_TOKEN}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    })
    const res = await POST(req, makeContext())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 404 NOT_FOUND when the token does not match any session', async () => {
    mockedFindSession.mockResolvedValue(null)
    const res = await POST(makeRequest({ displayName: 'Иван' }), makeContext('unknown'))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
    expect(mockedFindSession).toHaveBeenCalledWith('unknown')
    expect(mockedCreateParticipant).not.toHaveBeenCalled()
  })

  it('returns 409 REGISTRATION_CLOSED when session is in STAGE2', async () => {
    mockedFindSession.mockResolvedValue(fakeSession({ stage: 'STAGE2' }))
    const res = await POST(makeRequest({ displayName: 'Иван' }), makeContext())
    expect(res.status).toBe(409)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('REGISTRATION_CLOSED')
    expect(mockedCreateParticipant).not.toHaveBeenCalled()
  })

  it('returns 409 REGISTRATION_CLOSED when session is FINISHED', async () => {
    mockedFindSession.mockResolvedValue(fakeSession({ stage: 'FINISHED' }))
    const res = await POST(makeRequest({ displayName: 'Иван' }), makeContext())
    expect(res.status).toBe(409)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('REGISTRATION_CLOSED')
    expect(mockedCreateParticipant).not.toHaveBeenCalled()
  })

  it('returns 409 CAPACITY_REACHED when count >= maxParticipants', async () => {
    mockedFindSession.mockResolvedValue(fakeSession({ maxParticipants: 3 }))
    mockedCountParticipants.mockResolvedValue(3)
    const res = await POST(makeRequest({ displayName: 'Иван' }), makeContext())
    expect(res.status).toBe(409)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('CAPACITY_REACHED')
    expect(mockedCreateParticipant).not.toHaveBeenCalled()
  })

  it('returns 200 with accessKey + participant on the happy path', async () => {
    mockedFindSession.mockResolvedValue(fakeSession({ maxParticipants: 5 }))
    mockedCountParticipants.mockResolvedValue(2)
    mockedCreateParticipant.mockResolvedValue({ id: 'p_new', displayName: 'Иван' })

    const res = await POST(makeRequest({ displayName: 'Иван' }), makeContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{
      accessKey: string
      participant: { id: string; displayName: string }
    }>
    expect(body.ok).toBe(true)
    expect(body.data.accessKey).toBe('ABCD2345')
    expect(body.data.participant).toEqual({ id: 'p_new', displayName: 'Иван' })
  })

  it('passes hashed accessKey + trimmed displayName to the repo (hasJoined left default = false)', async () => {
    // The repo helper deliberately does not accept `hasJoined` — registration
    // never sets it, so it remains `false` (the schema default) until the
    // participant logs in and `markParticipantJoined` flips it. We verify
    // this by checking that the params handed to the repo carry only the
    // four expected keys.
    mockedFindSession.mockResolvedValue(fakeSession({ maxParticipants: 5 }))
    mockedCountParticipants.mockResolvedValue(0)
    mockedCreateParticipant.mockResolvedValue({ id: 'p_new', displayName: 'Иван' })

    await POST(makeRequest({ displayName: '  Иван  ' }), makeContext())

    expect(mockedCreateParticipant).toHaveBeenCalledTimes(1)
    const callArgs = mockedCreateParticipant.mock.calls[0][0]
    expect(callArgs).toEqual({
      sessionId: 'sess_1',
      displayName: 'Иван',
      accessKey: 'ABCD2345',
      accessKeyHash: 'hash:ABCD2345',
    })
    // The route must NOT pass hasJoined — the schema default of false is the
    // contract for "registered but not yet logged in".
    expect(Object.keys(callArgs).sort()).toEqual(
      ['accessKey', 'accessKeyHash', 'displayName', 'sessionId'].sort(),
    )
  })

  it('does not set a session cookie (registration is not login)', async () => {
    mockedFindSession.mockResolvedValue(fakeSession({ maxParticipants: 5 }))
    mockedCountParticipants.mockResolvedValue(0)
    mockedCreateParticipant.mockResolvedValue({ id: 'p_new', displayName: 'Иван' })

    const res = await POST(makeRequest({ displayName: 'Иван' }), makeContext())
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('retries on a Prisma P2002 unique-constraint failure with a fresh key', async () => {
    mockedFindSession.mockResolvedValue(fakeSession({ maxParticipants: 5 }))
    mockedCountParticipants.mockResolvedValue(0)
    mockedGenerateAccessKey.mockReturnValueOnce('FIRSTKEY').mockReturnValueOnce('SECONDK2')
    mockedHashKey.mockReturnValueOnce('hash:FIRSTKEY').mockReturnValueOnce('hash:SECONDK2')
    mockedCreateParticipant
      .mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }))
      .mockResolvedValueOnce({ id: 'p_new', displayName: 'Иван' })

    const res = await POST(makeRequest({ displayName: 'Иван' }), makeContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{
      accessKey: string
      participant: { id: string; displayName: string }
    }>
    expect(body.data.accessKey).toBe('SECONDK2')
    expect(mockedCreateParticipant).toHaveBeenCalledTimes(2)
  })

  it('returns 500 INTERNAL_ERROR if the unique-constraint collision repeats past the retry limit', async () => {
    mockedFindSession.mockResolvedValue(fakeSession({ maxParticipants: 5 }))
    mockedCountParticipants.mockResolvedValue(0)
    mockedCreateParticipant.mockRejectedValue(
      Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
    )

    const res = await POST(makeRequest({ displayName: 'Иван' }), makeContext())
    expect(res.status).toBe(500)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })
})
