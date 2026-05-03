/**
 * POST /api/auth/admin — admin login.
 *
 * Body: { password: string }
 * Success: 200 { ok: true, data: {} } + Set-Cookie: session_token=...
 * Errors:  400 INVALID_INPUT | 404 NOT_FOUND | 401 INVALID_PASSWORD | 429 RATE_LIMITED
 *
 * Auth model: cookies only. We deliberately do NOT support an Authorization
 * header path — that would broaden the attack surface (CSRF semantics differ
 * for headers vs. cookies) and add no value for an in-browser admin flow.
 *
 * Lockout precedes credential check: a locked IP gets 429 even if the supplied
 * password happens to be correct. This is intentional — under credential
 * stuffing, an attacker who has burned through 5 wrong guesses must wait, even
 * if their next guess would have been right.
 */

import type { NextResponse } from 'next/server'
import { z } from 'zod'
import { err, ok } from '@/lib/api/responses'
import { setSessionCookie } from '@/lib/auth/cookies'
import { signToken } from '@/lib/auth/jwt'
import { checkLockout, recordFailure, recordSuccess } from '@/lib/auth/rate-limit'
import { verifyPassword } from '@/lib/crypto'
import { getActiveSession } from '@/db/repos/session'

const BodySchema = z.object({
  password: z.string().min(1),
})

/**
 * Best-effort client IP extraction. `x-forwarded-for` is set by Vercel's edge
 * network and most reverse proxies; the leftmost entry is the original client.
 * Spoofable by a client connecting directly (no proxy in front), but our
 * threat model — a small group of friends — does not require defeating that.
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
    return err('INVALID_INPUT', 'Пароль обязателен', 400)
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

  const valid = await verifyPassword(parsed.data.password, session.adminPasswordHash)
  if (!valid) {
    recordFailure(ip, now)
    return err('INVALID_PASSWORD', 'Неверный пароль', 401)
  }

  recordSuccess(ip)
  const token = await signToken({ kind: 'admin', sessionId: session.id })
  const res = ok({}) as NextResponse
  setSessionCookie(res.cookies, token)
  return res
}
