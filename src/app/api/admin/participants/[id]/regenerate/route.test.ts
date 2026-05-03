import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/participant', () => ({
  updateParticipantKeyHash: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  generateAccessKey: vi.fn(),
  hashKey: vi.fn(),
}))

import { headers } from 'next/headers'
import { POST } from './route'
import { updateParticipantKeyHash, type ParticipantPublic } from '@/db/repos/participant'
import { generateAccessKey, hashKey } from '@/lib/crypto'

const mockedHeaders = vi.mocked(headers)
const mockedUpdate = vi.mocked(updateParticipantKeyHash)
const mockedGenerate = vi.mocked(generateAccessKey)
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
    id: 'p_1',
    displayName: null,
    hasJoined: false,
    lastSeenAt: null,
    createdAt: new Date('2026-05-03T00:00:00Z'),
    ...overrides,
  }
}

function makeRequest(): Request {
  return new Request('https://example.test/api/admin/participants/p_1/regenerate', {
    method: 'POST',
  })
}

function ctx(id = 'p_1') {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedUpdate.mockReset()
  mockedGenerate.mockReset()
  mockedHashKey.mockReset()

  mockedGenerate.mockReturnValue('NEWKEY12')
  mockedHashKey.mockImplementation((plain: string) => `hash(${plain})`)
})

describe('POST /api/admin/participants/:id/regenerate', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    participantHeaders()
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('returns 200 with the new plaintext key on success', async () => {
    adminHeaders()
    mockedUpdate.mockResolvedValue(fakeParticipant())

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ accessKey: string }>
    expect(body.data.accessKey).toBe('NEWKEY12')
    expect(mockedUpdate).toHaveBeenCalledWith('sess_1', 'p_1', 'NEWKEY12', 'hash(NEWKEY12)')
  })

  it('returns 404 NOT_FOUND when the participant does not exist', async () => {
    adminHeaders()
    mockedUpdate.mockResolvedValue(null)

    const res = await POST(makeRequest(), ctx('p_missing'))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
