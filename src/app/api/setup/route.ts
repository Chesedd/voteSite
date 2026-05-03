/**
 * POST /api/setup — bootstrap the single active session.
 *
 * Body: { password: string, maxParticipants: number }
 * Success: 200 { ok: true, data: { joinToken: string } } + Set-Cookie: session_token=...
 * Errors:  400 INVALID_INPUT | 409 SESSION_EXISTS
 *
 * Setup creates the Session shell only — no participants. The admin shares
 * `/join/{joinToken}` and participants self-register up to `maxParticipants`
 * (see ARCHITECTURE.md "Self-Registration Flow").
 *
 * Stage choice: the new Session is created with stage = STAGE1. The "no
 * session exists" state is represented by the absence of a Session row, not
 * by an enum value. See docs/ARCHITECTURE.md "Stage Machine".
 *
 * Auth: none. The endpoint is gated by the application-level invariant
 * "exactly one Session row at a time" — we re-check for an existing session
 * and refuse (409) if one is found. There is a tiny TOCTOU window between
 * the check and the create, but the worst case is that two concurrent setup
 * requests both succeed; the second just adds a stray row that
 * getActiveSession() may or may not pick. In practice this requires two
 * admins racing during the first 200ms of the app's life — acceptable risk.
 */

import type { NextResponse } from 'next/server'
import { z } from 'zod'
import { err, ok } from '@/lib/api/responses'
import { setSessionCookie } from '@/lib/auth/cookies'
import { signToken } from '@/lib/auth/jwt'
import { generateJoinToken, hashPassword } from '@/lib/crypto'
import { createSession, getActiveSession } from '@/db/repos/session'

const MIN_PASSWORD_LENGTH = 8
const MIN_PARTICIPANTS = 2
const MAX_PARTICIPANTS = 100
const DEFAULT_TITLE = 'Голосование'

const BodySchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH),
  maxParticipants: z.number().int().min(MIN_PARTICIPANTS).max(MAX_PARTICIPANTS),
})

export async function POST(req: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return err('INVALID_INPUT', 'Некорректный JSON в теле запроса', 400)
  }

  const parsed = BodySchema.safeParse(payload)
  if (!parsed.success) {
    return err(
      'INVALID_INPUT',
      `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов, лимит участников — от ${MIN_PARTICIPANTS} до ${MAX_PARTICIPANTS}.`,
      400,
    )
  }

  const existing = await getActiveSession()
  if (existing) {
    return err('SESSION_EXISTS', 'Сессия уже создана', 409)
  }

  const { password, maxParticipants } = parsed.data

  const adminPasswordHash = await hashPassword(password)
  const joinToken = generateJoinToken()

  const session = await createSession({
    title: DEFAULT_TITLE,
    adminPasswordHash,
    joinToken,
    maxParticipants,
  })

  const token = await signToken({ kind: 'admin', sessionId: session.id })
  const res = ok({ joinToken: session.joinToken }) as NextResponse
  setSessionCookie(res.cookies, token)
  return res
}
