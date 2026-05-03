import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, ApiSuccess } from '@/lib/api/responses'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('@/db/repos/participant', () => ({
  countParticipants: vi.fn(),
  deleteParticipant: vi.fn(),
  renameParticipant: vi.fn(),
}))

import { headers } from 'next/headers'
import { DELETE, PATCH } from './route'
import {
  countParticipants,
  deleteParticipant,
  renameParticipant,
  type ParticipantPublic,
} from '@/db/repos/participant'

const mockedHeaders = vi.mocked(headers)
const mockedCount = vi.mocked(countParticipants)
const mockedDelete = vi.mocked(deleteParticipant)
const mockedRename = vi.mocked(renameParticipant)

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

function patchRequest(body: unknown): Request {
  return new Request('https://example.test/api/admin/participants/p_1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function deleteRequest(): Request {
  return new Request('https://example.test/api/admin/participants/p_1', {
    method: 'DELETE',
  })
}

function ctx(id = 'p_1') {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockedHeaders.mockReset()
  mockedCount.mockReset()
  mockedDelete.mockReset()
  mockedRename.mockReset()
})

describe('PATCH /api/admin/participants/:id', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await PATCH(patchRequest({ displayName: 'Аня' }), ctx())
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(mockedRename).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    participantHeaders()
    const res = await PATCH(patchRequest({ displayName: 'Аня' }), ctx())
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 200 with the renamed participant on a valid name (trimmed)', async () => {
    adminHeaders()
    mockedRename.mockResolvedValue(fakeParticipant({ displayName: 'Аня' }))

    const res = await PATCH(patchRequest({ displayName: '  Аня  ' }), ctx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<{ participant: ParticipantPublic }>
    expect(body.data.participant.displayName).toBe('Аня')
    expect(mockedRename).toHaveBeenCalledWith('sess_1', 'p_1', 'Аня')
  })

  it('returns 200 and clears the name when displayName is null', async () => {
    adminHeaders()
    mockedRename.mockResolvedValue(fakeParticipant({ displayName: null }))

    const res = await PATCH(patchRequest({ displayName: null }), ctx())
    expect(res.status).toBe(200)
    expect(mockedRename).toHaveBeenCalledWith('sess_1', 'p_1', null)
  })

  it('returns 400 INVALID_INPUT when displayName is empty after trim', async () => {
    adminHeaders()
    const res = await PATCH(patchRequest({ displayName: '   ' }), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedRename).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when displayName is over 40 chars', async () => {
    adminHeaders()
    const res = await PATCH(patchRequest({ displayName: 'a'.repeat(41) }), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedRename).not.toHaveBeenCalled()
  })

  it('returns 400 INVALID_INPUT when the body has no fields', async () => {
    adminHeaders()
    const res = await PATCH(patchRequest({}), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('returns 404 NOT_FOUND when the participant does not exist in this session', async () => {
    adminHeaders()
    mockedRename.mockResolvedValue(null)

    const res = await PATCH(patchRequest({ displayName: 'Аня' }), ctx('p_missing'))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 INVALID_INPUT on malformed JSON', async () => {
    adminHeaders()
    const req = new Request('https://example.test/api/admin/participants/p_1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    })
    const res = await PATCH(req, ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
  })
})

describe('DELETE /api/admin/participants/:id', () => {
  it('returns 401 UNAUTHORIZED when there is no auth', async () => {
    setHeaders({})
    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(401)
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN when the actor is a participant', async () => {
    participantHeaders()
    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(403)
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('returns 200 when the participant is deleted', async () => {
    adminHeaders()
    mockedCount.mockResolvedValue(3)
    mockedDelete.mockResolvedValue(true)

    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<unknown>
    expect(body.ok).toBe(true)
    expect(mockedDelete).toHaveBeenCalledWith('sess_1', 'p_1')
  })

  it('returns 400 INVALID_INPUT when the participant is the last one', async () => {
    adminHeaders()
    mockedCount.mockResolvedValue(1)

    const res = await DELETE(deleteRequest(), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_INPUT')
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('returns 404 NOT_FOUND when the participant does not exist', async () => {
    adminHeaders()
    mockedCount.mockResolvedValue(3)
    mockedDelete.mockResolvedValue(false)

    const res = await DELETE(deleteRequest(), ctx('p_missing'))
    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
