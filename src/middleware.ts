/**
 * Auth-state middleware.
 *
 * Runs on every (non-static) request. Parses the session cookie, verifies the
 * JWT, and forwards the decoded identity to downstream route handlers via
 * `x-auth-*` headers. This file is the ONLY place where these headers are
 * trusted to be set; guards in `src/lib/auth/guards.ts` read them.
 *
 * Security: any incoming `x-auth-*` headers are stripped before we set our
 * own. Otherwise a client could spoof identity by sending these headers
 * directly to the Next.js server.
 *
 * Edge runtime: this file must only import Edge-compatible modules
 * (no Node-only APIs). `jose` and the cookie parsing helper both qualify.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth/cookies'
import { verifyToken } from '@/lib/auth/jwt'

export async function middleware(req: NextRequest) {
  const headers = new Headers(req.headers)

  // Strip any spoofed auth headers from the incoming request before we
  // (maybe) set our own. Order matters: do this unconditionally.
  headers.delete('x-auth-kind')
  headers.delete('x-auth-session-id')
  headers.delete('x-auth-participant-id')

  const token = getTokenFromRequest(req)
  const payload = token ? await verifyToken(token) : null

  if (payload) {
    headers.set('x-auth-kind', payload.kind)
    headers.set('x-auth-session-id', payload.sessionId)
    if (payload.kind === 'participant') {
      headers.set('x-auth-participant-id', payload.participantId)
    }
  }

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
