import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser, requireAdmin, requireParticipant } from './guards'
import type { ApiError } from '@/lib/api/responses'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

import { headers } from 'next/headers'

const mockedHeaders = vi.mocked(headers)

function setHeaders(entries: Record<string, string>): void {
  const h = new Headers(entries)
  mockedHeaders.mockResolvedValue(h as unknown as Awaited<ReturnType<typeof headers>>)
}

beforeEach(() => {
  mockedHeaders.mockReset()
})

describe('getSessionUser', () => {
  it('returns null when no auth headers are present', async () => {
    setHeaders({})
    expect(await getSessionUser()).toBeNull()
  })

  it('returns AdminContext when kind=admin', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    expect(await getSessionUser()).toEqual({ kind: 'admin', sessionId: 'sess_1' })
  })

  it('returns ParticipantContext when kind=participant', async () => {
    setHeaders({
      'x-auth-kind': 'participant',
      'x-auth-session-id': 'sess_1',
      'x-auth-participant-id': 'p_42',
    })
    expect(await getSessionUser()).toEqual({
      kind: 'participant',
      sessionId: 'sess_1',
      participantId: 'p_42',
    })
  })

  it('returns null when x-auth-kind has a bogus value', async () => {
    setHeaders({ 'x-auth-kind': 'superuser', 'x-auth-session-id': 'sess_1' })
    expect(await getSessionUser()).toBeNull()
  })

  it('returns null when participant kind is missing the participant id', async () => {
    setHeaders({ 'x-auth-kind': 'participant', 'x-auth-session-id': 'sess_1' })
    expect(await getSessionUser()).toBeNull()
  })

  it('returns null when sessionId is missing even if kind is set', async () => {
    setHeaders({ 'x-auth-kind': 'admin' })
    expect(await getSessionUser()).toBeNull()
  })
})

async function captureThrown(fn: () => Promise<unknown>): Promise<Response> {
  try {
    await fn()
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
  throw new Error('expected guard to throw a Response')
}

describe('requireAdmin', () => {
  it('throws a 401 UNAUTHORIZED Response when no auth', async () => {
    setHeaders({})
    const res = await captureThrown(() => requireAdmin())
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    })
  })

  it('throws a 403 FORBIDDEN Response when kind=participant', async () => {
    setHeaders({
      'x-auth-kind': 'participant',
      'x-auth-session-id': 'sess_1',
      'x-auth-participant-id': 'p_42',
    })
    const res = await captureThrown(() => requireAdmin())
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns the AdminContext when kind=admin', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    expect(await requireAdmin()).toEqual({ kind: 'admin', sessionId: 'sess_1' })
  })
})

describe('requireParticipant', () => {
  it('throws a 401 UNAUTHORIZED Response when no auth', async () => {
    setHeaders({})
    const res = await captureThrown(() => requireParticipant())
    expect(res.status).toBe(401)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('throws a 403 FORBIDDEN Response when kind=admin', async () => {
    setHeaders({ 'x-auth-kind': 'admin', 'x-auth-session-id': 'sess_1' })
    const res = await captureThrown(() => requireParticipant())
    expect(res.status).toBe(403)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns the ParticipantContext when kind=participant', async () => {
    setHeaders({
      'x-auth-kind': 'participant',
      'x-auth-session-id': 'sess_1',
      'x-auth-participant-id': 'p_42',
    })
    expect(await requireParticipant()).toEqual({
      kind: 'participant',
      sessionId: 'sess_1',
      participantId: 'p_42',
    })
  })
})
