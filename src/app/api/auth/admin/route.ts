/**
 * POST /api/auth/admin
 *
 * Admin login: exchanges a password for a session cookie carrying a signed
 * JWT. See docs/ARCHITECTURE.md "Auth Flow → Admin" and "Error Codes".
 *
 * Auth model: cookies only. We deliberately do NOT support an `Authorization`
 * header path — the entire app uses httpOnly cookies + JWT, and adding a
 * header path here would create a second auth code path that the rest of the
 * codebase does not honour. If a future client (CLI, mobile) needs token-only
 * auth, it should be a separate endpoint.
 *
 * Lockout policy: a valid password during a lockout still returns 429. We do
 * NOT bypass the lockout for valid credentials — that would let an attacker
 * doing credential stuffing eventually slip through if they happen to land on
 * the right password during the cooldown window.
 */

import { NextResponse } from 'next/server'
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
 * Best-effort client IP. `x-forwarded-for` can be spoofed by clients that
 * bypass our edge, but for this app's threat model — a private group of
 * friends — it is adequate as a rate-limit key. The `'unknown'` fallback
 * groups all keyless callers under one bucket, which is fine for the same
 * reason.
 */
function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

function formatRetryAfter(lockoutUntilMs: number, nowMs: number = Date.now()): string {
  const seconds = Math.max(1, Math.ceil((lockoutUntilMs - nowMs) / 1000))
  if (seconds < 60) return `Повторите через ${seconds} с`
  const minutes = Math.ceil(seconds / 60)
  return `Повторите через ${minutes} мин`
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return err('INVALID_INPUT', 'Тело запроса должно быть JSON', 400)
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return err('INVALID_INPUT', 'Введите пароль', 400)
  }

  const ip = getClientIp(req)

  const lockedUntil = checkLockout(ip)
  if (lockedUntil !== null) {
    return err('RATE_LIMITED', formatRetryAfter(lockedUntil), 429)
  }

  const session = await getActiveSession()
  if (!session) {
    return err('NOT_FOUND', 'Сессия ещё не создана', 404)
  }

  const passwordOk = await verifyPassword(parsed.data.password, session.adminPasswordHash)
  if (!passwordOk) {
    const newLockout = recordFailure(ip)
    if (newLockout !== null) {
      return err('RATE_LIMITED', formatRetryAfter(newLockout), 429)
    }
    return err('INVALID_PASSWORD', 'Неверный пароль', 401)
  }

  recordSuccess(ip)
  const token = await signToken({ kind: 'admin', sessionId: session.id })

  const res = ok({}) as NextResponse
  setSessionCookie(res.cookies, token)
  return res
}
