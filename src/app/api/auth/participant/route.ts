/**
 * POST /api/auth/participant — participant login.
 *
 * Body: { accessKey: string } (8-char string from generateAccessKey)
 * Success: 200 { ok: true, data: { participant: { id, displayName } } } + Set-Cookie: session_token=...
 * Errors:  400 INVALID_INPUT | 404 NOT_FOUND | 401 INVALID_KEY | 429 RATE_LIMITED | 500 INTERNAL_ERROR
 *
 * Mirrors the admin login (`/api/auth/admin`) with three deliberate differences:
 *   1. SHA-256 lookup on `accessKeyHash`, not bcrypt comparison. Access keys are
 *      8-char random strings (~40 bits), used one-time per login attempt; brute-
 *      force resistance comes from the rate limiter, not the hash function.
 *   2. On success, mark the participant as joined (hasJoined = true, lastSeenAt
 *      = now) so the admin UI can show "N/M participants joined" later (P3-04).
 *   3. Response includes participant info — the client needs `displayName` for
 *      the UI greeting after login.
 *
 * The IP rate-limit bucket is INTENTIONALLY shared with the admin endpoint
 * (same module-level Map in `@/lib/auth/rate-limit`). An attacker brute-forcing
 * both endpoints from one IP gets locked out across both. Lockout precedes the
 * credential check: a locked IP gets 429 even if the supplied key is correct.
 */

import type { NextResponse } from 'next/server'
import { z } from 'zod'
import { err, ok } from '@/lib/api/responses'
import { setSessionCookie } from '@/lib/auth/cookies'
import { signToken } from '@/lib/auth/jwt'
import { checkLockout, recordFailure, recordSuccess } from '@/lib/auth/rate-limit'
import { hashKey } from '@/lib/crypto'
import { getActiveSession } from '@/db/repos/session'
import { findParticipantByKeyHash, markParticipantJoined } from '@/db/repos/participant'

const ACCESS_KEY_LENGTH = 8

const BodySchema = z.object({
  accessKey: z.string().length(ACCESS_KEY_LENGTH),
})

/**
 * Best-effort client IP extraction. Same logic as the admin endpoint; see the
 * rationale comment there.
 */
function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

function formatRetryHint(lockoutUntil: number, now: number): string {
  const seconds = Math.max(1, Math.ceil((lockoutUntil - now) / 1000))
  if (seconds < 60) return `Повторите попытку через ${seconds} сек.`
  const minutes = Math.ceil(seconds / 60)
  return `Повторите попытку через ${minutes} мин.`
}

export async function POST(req: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return err('INVALID_INPUT', 'Некорректный JSON в теле запроса', 400)
  }

  const parsed = BodySchema.safeParse(payload)
  if (!parsed.success) {
    return err('INVALID_INPUT', 'Ключ должен содержать 8 символов', 400)
  }

  const ip = getClientIp(req)
  const now = Date.now()

  const lockedUntil = checkLockout(ip, now)
  if (lockedUntil !== null) {
    return err('RATE_LIMITED', formatRetryHint(lockedUntil, now), 429)
  }

  const session = await getActiveSession()
  if (!session) {
    return err('NOT_FOUND', 'Сессия ещё не создана', 404)
  }

  const keyHash = hashKey(parsed.data.accessKey)
  const participant = await findParticipantByKeyHash(session.id, keyHash)
  if (!participant) {
    recordFailure(ip, now)
    return err('INVALID_KEY', 'Неверный ключ', 401)
  }

  // Order: clear rate-limit bucket FIRST so a transient DB failure on the
  // join-marking step doesn't leave the user with a stale lockout counter.
  // If markParticipantJoined throws, we abort before issuing the cookie/token —
  // the user retries and gets a clean attempt. No rollbacks needed.
  recordSuccess(ip)
  try {
    await markParticipantJoined(participant.id)
  } catch {
    return err('INTERNAL_ERROR', 'Не удалось завершить вход. Попробуйте снова.', 500)
  }

  const token = await signToken({
    kind: 'participant',
    sessionId: session.id,
    participantId: participant.id,
  })
  const res = ok({
    participant: {
      id: participant.id,
      displayName: participant.displayName,
    },
  }) as NextResponse
  setSessionCookie(res.cookies, token)
  return res
}
