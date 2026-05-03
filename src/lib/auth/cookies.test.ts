import { describe, expect, it } from 'vitest'
import { SESSION_COOKIE_NAME, getTokenFromRequest } from './cookies'

function makeRequest(cookieHeader: string | null): Request {
  const headers = new Headers()
  if (cookieHeader !== null) headers.set('cookie', cookieHeader)
  return new Request('https://example.test/', { headers })
}

describe('getTokenFromRequest', () => {
  it('extracts the token from a single-cookie header', () => {
    const req = makeRequest(`${SESSION_COOKIE_NAME}=abc.def.ghi`)
    expect(getTokenFromRequest(req)).toBe('abc.def.ghi')
  })

  it('extracts the token from a multi-cookie header', () => {
    const req = makeRequest(`other=foo; ${SESSION_COOKIE_NAME}=xyz.123.456; bar=baz`)
    expect(getTokenFromRequest(req)).toBe('xyz.123.456')
  })

  it('returns null when our cookie is missing from a populated header', () => {
    const req = makeRequest('other=foo; bar=baz')
    expect(getTokenFromRequest(req)).toBeNull()
  })

  it('returns null when no Cookie header is present', () => {
    const req = makeRequest(null)
    expect(getTokenFromRequest(req)).toBeNull()
  })
})
