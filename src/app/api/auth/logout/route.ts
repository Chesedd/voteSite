/**
 * POST /api/auth/logout — clear the session cookie.
 *
 * Stateless: no auth check, no DB call. Anyone can hit this endpoint; the only
 * effect is `Set-Cookie: session_token=; Max-Age=0`. Clearing a cookie the
 * caller may not have is harmless and idempotent.
 */

import type { NextResponse } from 'next/server'
import { ok } from '@/lib/api/responses'
import { clearSessionCookie } from '@/lib/auth/cookies'

export async function POST(): Promise<Response> {
  const res = ok({}) as NextResponse
  clearSessionCookie(res.cookies)
  return res
}
