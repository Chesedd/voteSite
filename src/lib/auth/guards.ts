/**
 * Route-handler guards for auth.
 *
 * Reads the `x-auth-*` headers populated by `src/middleware.ts` and either
 * returns a typed `AuthContext` or short-circuits with a 401/403 `Response`.
 *
 * Calling pattern (see CLAUDE.md "Conventions"):
 *
 *   export async function POST(req: Request) {
 *     try {
 *       const admin = await requireAdmin()
 *       // ...handler logic...
 *       return ok(data)
 *     } catch (e) {
 *       if (e instanceof Response) return e
 *       throw e
 *     }
 *   }
 *
 * Guards `throw` a `Response` rather than returning one so callers stay flat
 * (no `if (ctx instanceof Response) return ctx` after every guard call).
 */

import { headers } from 'next/headers'
import { err } from '@/lib/api/responses'

export type AdminContext = { kind: 'admin'; sessionId: string }
export type ParticipantContext = {
  kind: 'participant'
  sessionId: string
  participantId: string
}
export type AuthContext = AdminContext | ParticipantContext

export async function getSessionUser(): Promise<AuthContext | null> {
  const h = await headers()
  const kind = h.get('x-auth-kind')
  const sessionId = h.get('x-auth-session-id')

  if (!sessionId) return null

  if (kind === 'admin') {
    return { kind: 'admin', sessionId }
  }
  if (kind === 'participant') {
    const participantId = h.get('x-auth-participant-id')
    if (!participantId) return null
    return { kind: 'participant', sessionId, participantId }
  }
  return null
}

export async function requireAdmin(): Promise<AdminContext> {
  const user = await getSessionUser()
  if (!user) {
    throw err('UNAUTHORIZED', 'Authentication required', 401)
  }
  if (user.kind !== 'admin') {
    throw err('FORBIDDEN', 'Admin access required', 403)
  }
  return user
}

export async function requireParticipant(): Promise<ParticipantContext> {
  const user = await getSessionUser()
  if (!user) {
    throw err('UNAUTHORIZED', 'Authentication required', 401)
  }
  if (user.kind !== 'participant') {
    throw err('FORBIDDEN', 'Participant access required', 403)
  }
  return user
}
