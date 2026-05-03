/**
 * Session cookie helpers.
 *
 * Edge-compatible: only uses Web standards (`Request.headers`) and Next 15's
 * `ResponseCookies` shape. No Node-only imports.
 */

import { type ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'

export const SESSION_COOKIE_NAME = 'session_token'

const SESSION_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function setSessionCookie(cookies: ResponseCookies, token: string): void {
  cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  })
}

export function clearSessionCookie(cookies: ResponseCookies): void {
  cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: 0,
  })
}

export function getTokenFromRequest(req: Request): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  return parseCookieHeader(header).get(SESSION_COOKIE_NAME) ?? null
}

function parseCookieHeader(header: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (!name) continue
    const value = part.slice(eq + 1).trim()
    out.set(name, decodeURIComponent(value))
  }
  return out
}
