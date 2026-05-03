import { describe, expect, it } from 'vitest'
import type { ApiSuccess } from '@/lib/api/responses'
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies'
import { POST } from './route'

describe('POST /api/auth/logout', () => {
  it('returns 200 with the standard success envelope', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<Record<string, never>>
    expect(body).toEqual({ ok: true, data: {} })
  })

  it('clears the session_token cookie via Max-Age=0', async () => {
    const res = await POST()
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(setCookie).toMatch(/Max-Age=0/i)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Path=\//i)
  })

  it('is idempotent — works even when no incoming session cookie is present', async () => {
    // No request object passed in — handler takes none.
    const a = await POST()
    const b = await POST()
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.headers.get('set-cookie')).not.toBeNull()
    expect(b.headers.get('set-cookie')).not.toBeNull()
  })
})
