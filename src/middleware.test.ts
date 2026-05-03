/**
 * Integration test for the auth middleware.
 *
 * Exercises the full cookie → JWT → header forwarding chain in-process,
 * including the spoofed-header attack: a client sending `x-auth-*` headers
 * directly must NOT have them propagated to downstream handlers.
 *
 * NextResponse.next({ request: { headers } }) propagates the modified request
 * headers by setting `x-middleware-request-<key>` headers on the response,
 * plus `x-middleware-override-headers` listing the keys. We assert against
 * those.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { signToken } from '@/lib/auth/jwt'
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies'
import { middleware } from './middleware'

const TEST_SECRET = 'a'.repeat(48)

function makeRequest(opts: {
  cookieToken?: string
  extraHeaders?: Record<string, string>
}): NextRequest {
  const headers = new Headers(opts.extraHeaders)
  if (opts.cookieToken !== undefined) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${opts.cookieToken}`)
  }
  return new NextRequest('https://example.test/api/anything', { headers })
}

function getForwardedHeader(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name.toLowerCase()}`)
}

function getOverrideKeys(res: Response): string[] {
  const raw = res.headers.get('x-middleware-override-headers')
  return raw ? raw.split(',') : []
}

describe('middleware', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('forwards no x-auth headers when there is no cookie', async () => {
    const res = await middleware(makeRequest({}))
    expect(getForwardedHeader(res, 'x-auth-kind')).toBeNull()
    expect(getForwardedHeader(res, 'x-auth-session-id')).toBeNull()
    expect(getForwardedHeader(res, 'x-auth-participant-id')).toBeNull()
  })

  it('forwards admin x-auth headers for a valid admin token', async () => {
    const token = await signToken({ kind: 'admin', sessionId: 'sess_1' })
    const res = await middleware(makeRequest({ cookieToken: token }))
    expect(getForwardedHeader(res, 'x-auth-kind')).toBe('admin')
    expect(getForwardedHeader(res, 'x-auth-session-id')).toBe('sess_1')
    expect(getForwardedHeader(res, 'x-auth-participant-id')).toBeNull()
  })

  it('forwards participant x-auth headers for a valid participant token', async () => {
    const token = await signToken({
      kind: 'participant',
      sessionId: 'sess_1',
      participantId: 'p_42',
    })
    const res = await middleware(makeRequest({ cookieToken: token }))
    expect(getForwardedHeader(res, 'x-auth-kind')).toBe('participant')
    expect(getForwardedHeader(res, 'x-auth-session-id')).toBe('sess_1')
    expect(getForwardedHeader(res, 'x-auth-participant-id')).toBe('p_42')
  })

  it('forwards no x-auth headers when the cookie token is invalid', async () => {
    const res = await middleware(makeRequest({ cookieToken: 'not.a.real.jwt' }))
    expect(getForwardedHeader(res, 'x-auth-kind')).toBeNull()
    expect(getForwardedHeader(res, 'x-auth-session-id')).toBeNull()
  })

  it('strips spoofed x-auth headers from the incoming request (no cookie)', async () => {
    const res = await middleware(
      makeRequest({
        extraHeaders: {
          'x-auth-kind': 'admin',
          'x-auth-session-id': 'evil',
          'x-auth-participant-id': 'evil',
        },
      }),
    )
    // Override list must NOT contain any of our auth keys.
    const keys = getOverrideKeys(res)
    expect(keys).not.toContain('x-auth-kind')
    expect(keys).not.toContain('x-auth-session-id')
    expect(keys).not.toContain('x-auth-participant-id')
    // And the forwarded values must be empty.
    expect(getForwardedHeader(res, 'x-auth-kind')).toBeNull()
    expect(getForwardedHeader(res, 'x-auth-session-id')).toBeNull()
    expect(getForwardedHeader(res, 'x-auth-participant-id')).toBeNull()
  })

  it('overrides spoofed x-auth headers with values from the verified token', async () => {
    const token = await signToken({ kind: 'admin', sessionId: 'real_session' })
    const res = await middleware(
      makeRequest({
        cookieToken: token,
        extraHeaders: {
          'x-auth-kind': 'participant',
          'x-auth-session-id': 'evil',
          'x-auth-participant-id': 'evil',
        },
      }),
    )
    expect(getForwardedHeader(res, 'x-auth-kind')).toBe('admin')
    expect(getForwardedHeader(res, 'x-auth-session-id')).toBe('real_session')
    // Spoofed participant id must be gone — no admin token has that field.
    expect(getForwardedHeader(res, 'x-auth-participant-id')).toBeNull()
  })
})
