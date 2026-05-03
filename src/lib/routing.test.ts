import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db/repos/session', () => ({
  getActiveSession: vi.fn(),
}))
vi.mock('@/lib/auth/guards', () => ({
  getSessionUser: vi.fn(),
}))

import { decideHomeRoute, decideLoginRoute } from './routing'
import { getActiveSession } from '@/db/repos/session'
import { getSessionUser } from '@/lib/auth/guards'

const mockedGetActiveSession = vi.mocked(getActiveSession)
const mockedGetSessionUser = vi.mocked(getSessionUser)

type SessionRow = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>

function fakeSession(): SessionRow {
  const now = new Date('2026-05-03T00:00:00Z')
  return {
    id: 'sess_1',
    title: 'Test',
    stage: 'STAGE1',
    adminPasswordHash: '$2b$10$fakeFakeFakeFakeFakeFu',
    settings: {},
    createdAt: now,
    updatedAt: now,
  } as SessionRow
}

beforeEach(() => {
  mockedGetActiveSession.mockReset()
  mockedGetSessionUser.mockReset()
})

describe('decideHomeRoute', () => {
  it('redirects to /setup when no active session exists', async () => {
    mockedGetActiveSession.mockResolvedValue(null)
    mockedGetSessionUser.mockResolvedValue(null)
    expect(await decideHomeRoute()).toEqual({ kind: 'redirect', to: '/setup' })
  })

  it('redirects to /login when session exists but user is not authenticated', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedGetSessionUser.mockResolvedValue(null)
    expect(await decideHomeRoute()).toEqual({ kind: 'redirect', to: '/login' })
  })

  it('redirects to /admin when authenticated user is admin', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedGetSessionUser.mockResolvedValue({ kind: 'admin', sessionId: 'sess_1' })
    expect(await decideHomeRoute()).toEqual({ kind: 'redirect', to: '/admin' })
  })

  it('renders participant home when authenticated user is participant', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedGetSessionUser.mockResolvedValue({
      kind: 'participant',
      sessionId: 'sess_1',
      participantId: 'p_1',
    })
    expect(await decideHomeRoute()).toEqual({ kind: 'render', as: 'participant' })
  })
})

describe('decideLoginRoute', () => {
  it('redirects to /setup when no active session exists', async () => {
    mockedGetActiveSession.mockResolvedValue(null)
    mockedGetSessionUser.mockResolvedValue(null)
    expect(await decideLoginRoute()).toEqual({ kind: 'redirect', to: '/setup' })
  })

  it('renders the login form when session exists and user is not authenticated', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedGetSessionUser.mockResolvedValue(null)
    const decision = await decideLoginRoute()
    expect(decision.kind).toBe('render')
  })

  it('redirects to / when an admin is already authenticated', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedGetSessionUser.mockResolvedValue({ kind: 'admin', sessionId: 'sess_1' })
    expect(await decideLoginRoute()).toEqual({ kind: 'redirect', to: '/' })
  })

  it('redirects to / when a participant is already authenticated', async () => {
    mockedGetActiveSession.mockResolvedValue(fakeSession())
    mockedGetSessionUser.mockResolvedValue({
      kind: 'participant',
      sessionId: 'sess_1',
      participantId: 'p_1',
    })
    expect(await decideLoginRoute()).toEqual({ kind: 'redirect', to: '/' })
  })

  it('does not call getSessionUser when no active session exists', async () => {
    mockedGetActiveSession.mockResolvedValue(null)
    mockedGetSessionUser.mockResolvedValue(null)
    await decideLoginRoute()
    expect(mockedGetSessionUser).not.toHaveBeenCalled()
  })
})
