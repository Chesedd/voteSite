/**
 * POST /api/auth/logout
 *
 * Clears the session cookie. Stateless: no auth check, no DB call. Anyone
 * may call this endpoint — clearing a cookie the caller may not have is
 * harmless. See docs/ARCHITECTURE.md "Auth Flow".
 */

import { NextResponse } from 'next/server'
import { ok } from '@/lib/api/responses'
import { clearSessionCookie } from '@/lib/auth/cookies'

export async function POST(): Promise<Response> {
  const res = ok({}) as NextResponse
  clearSessionCookie(res.cookies)
  return res
}
