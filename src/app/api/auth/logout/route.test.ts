import { describe, expect, it } from 'vitest'
import { POST } from './route'
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies'
import type { ApiSuccess } from '@/lib/api/responses'

describe('POST /api/auth/logout', () => {
  it('returns 200 with the success envelope', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiSuccess<unknown>
    expect(body.ok).toBe(true)
  })

  it('clears the session cookie via Set-Cookie header', async () => {
    const res = await POST()
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)
    // Cleared cookie has Max-Age=0 (or an Expires in the past).
    expect(setCookie).toMatch(/Max-Age=0|Expires=/i)
  })

  it('is idempotent — works without an incoming session cookie', async () => {
    // POST takes no request, so this is naturally true; assert the call still
    // succeeds twice in a row to document the contract.
    const first = await POST()
    const second = await POST()
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
  })
})
