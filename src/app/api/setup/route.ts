/**
 * POST /api/setup — bootstrap the single active session.
 *
 * Body: { password: string, participantCount: number }
 * Success: 200 { ok: true, data: { accessKeys: string[] } } + Set-Cookie: session_token=...
 * Errors:  400 INVALID_INPUT | 409 SESSION_EXISTS
 *
 * This is the ONLY endpoint that returns plaintext access keys; after the
 * response is sent, the keys exist nowhere on the server (DB stores only
 * SHA-256 hashes). The admin must save them now or regenerate later.
 *
 * Stage choice: the new Session is created with stage = STAGE1. There is no
 * "empty" pre-stage — by the time the row is committed, participants already
 * exist, so the row is born ready for stage 1 submissions. See
 * docs/ARCHITECTURE.md "Stage Machine".
 *
 * Auth: none. The endpoint is gated by the application-level invariant
 * "exactly one Session row at a time" — the transaction re-checks for an
 * existing session and refuses (409) if one is found. There is a tiny TOCTOU
 * window between the check and the create, but the worst case is that two
 * concurrent setup requests both succeed in creating a Session; the second
 * just adds a stray row that getActiveSession() may or may not pick. In
 * practice this requires two admins racing during the first 200ms of the
 * app's life — acceptable risk for a one-shot tool.
 */

import type { NextResponse } from 'next/server'
import { z } from 'zod'
import { err, ok } from '@/lib/api/responses'
import { setSessionCookie } from '@/lib/auth/cookies'
import { signToken } from '@/lib/auth/jwt'
import { generateAccessKey, hashKey, hashPassword } from '@/lib/crypto'
import { createSessionWithParticipants, getActiveSession } from '@/db/repos/session'

const MIN_PASSWORD_LENGTH = 8
const MIN_PARTICIPANTS = 2
const MAX_PARTICIPANTS = 30
const DEFAULT_TITLE = 'Голосование'

const BodySchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH),
  participantCount: z.number().int().min(MIN_PARTICIPANTS).max(MAX_PARTICIPANTS),
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
      `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов, число участников — от ${MIN_PARTICIPANTS} до ${MAX_PARTICIPANTS}.`,
      400,
    )
  }

  const existing = await getActiveSession()
  if (existing) {
    return err('SESSION_EXISTS', 'Сессия уже создана', 409)
  }

  const { password, participantCount } = parsed.data

  const adminPasswordHash = await hashPassword(password)
  const accessKeys: string[] = []
  const participantKeyHashes: string[] = []
  for (let i = 0; i < participantCount; i++) {
    const key = generateAccessKey()
    accessKeys.push(key)
    participantKeyHashes.push(hashKey(key))
  }

  const session = await createSessionWithParticipants({
    title: DEFAULT_TITLE,
    adminPasswordHash,
    participantKeyHashes,
  })

  const token = await signToken({ kind: 'admin', sessionId: session.id })
  const res = ok({ accessKeys }) as NextResponse
  setSessionCookie(res.cookies, token)
  return res
}
