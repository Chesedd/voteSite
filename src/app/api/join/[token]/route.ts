/**
 * POST /api/join/[token] — public self-registration endpoint.
 *
 * Path param: token (16-char base64url, the Session.joinToken).
 * Body:       { displayName: string } (1..40 chars after trim).
 * Auth:       none. The unguessable token (~96 bits) is the only gate.
 *
 * Success: 200 { ok: true, data: { accessKey: string, participant: { id, displayName } } }
 * Errors:
 *   400 INVALID_INPUT       — body shape / length validation failed
 *   404 NOT_FOUND           — token doesn't match any session
 *   409 REGISTRATION_CLOSED — session is past STAGE1
 *   409 CAPACITY_REACHED    — maxParticipants already met
 *   500 INTERNAL_ERROR      — accessKey collision after retries (see notes)
 *
 * The plaintext access key is included in the success response so the
 * registrant can copy it before navigating to /login. We do NOT set a session
 * cookie here — registration ≠ login. `Participant.hasJoined` stays false
 * until the participant exchanges their key for a JWT via
 * /api/auth/participant (which is the existing P2-05 contract).
 *
 * Capacity enforcement: count + create runs inside a single Prisma
 * transaction, but at default isolation Postgres allows two concurrent
 * transactions to each see the pre-count and both insert. For the 5-20 friends
 * scale the project targets this is acceptable — at worst maxParticipants gets
 * exceeded by 1-2 in a tied race. Upgrading to SERIALIZABLE here would add
 * retry handling everywhere with no user-visible benefit.
 *
 * Collision handling: a SHA-256 collision on the freshly generated 8-char
 * access key is astronomically unlikely (< 2^-40 per call) but the
 * (sessionId, accessKeyHash) UNIQUE index would surface one as a Prisma
 * P2002. We retry up to 3 times with a fresh key before giving up with 500.
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { prisma } from '@/db/client'
import { generateAccessKey, hashKey } from '@/lib/crypto'
import { findSessionByJoinToken } from '@/db/repos/session'
import { countParticipants, createParticipantSelfRegistered } from '@/db/repos/participant'

const NAME_MIN = 1
const NAME_MAX = 40
const KEY_RETRY_LIMIT = 3

const BodySchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(NAME_MIN, 'Имя не может быть пустым')
      .max(NAME_MAX, `Имя должно быть не длиннее ${NAME_MAX} символов`),
  })
  .strict()

type RouteContext = { params: Promise<{ token: string }> }

class CapacityReachedError extends Error {
  constructor() {
    super('CAPACITY_REACHED')
    this.name = 'CapacityReachedError'
  }
}

class KeyCollisionError extends Error {
  constructor() {
    super('KEY_COLLISION')
    this.name = 'KeyCollisionError'
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'P2002'
  )
}

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const { token } = await ctx.params

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return err('INVALID_INPUT', 'Некорректный JSON в теле запроса', 400)
  }

  const parsed = BodySchema.safeParse(payload)
  if (!parsed.success) {
    return err('INVALID_INPUT', 'Имя должно быть от 1 до 40 символов', 400)
  }

  const session = await findSessionByJoinToken(token)
  if (!session) {
    return err('NOT_FOUND', 'Ссылка недействительна', 404)
  }
  if (session.stage !== 'STAGE1') {
    return err('REGISTRATION_CLOSED', 'Регистрация закрыта', 409)
  }

  const displayName = parsed.data.displayName

  let result: { id: string; displayName: string; accessKey: string }
  try {
    result = await prisma.$transaction(async (tx) => {
      const count = await countParticipants(session.id, tx)
      if (count >= session.maxParticipants) {
        throw new CapacityReachedError()
      }

      for (let attempt = 0; attempt < KEY_RETRY_LIMIT; attempt++) {
        const accessKey = generateAccessKey()
        const accessKeyHash = hashKey(accessKey)
        try {
          const created = await createParticipantSelfRegistered(
            { sessionId: session.id, displayName, accessKey, accessKeyHash },
            tx,
          )
          return { id: created.id, displayName: created.displayName, accessKey }
        } catch (e) {
          if (isUniqueViolation(e)) continue
          throw e
        }
      }
      throw new KeyCollisionError()
    })
  } catch (e) {
    if (e instanceof CapacityReachedError) {
      return err('CAPACITY_REACHED', 'Все места заняты', 409)
    }
    if (e instanceof KeyCollisionError) {
      console.error('join: access key collision after retries')
      return err('INTERNAL_ERROR', 'Не удалось создать участника. Попробуйте снова.', 500)
    }
    throw e
  }

  return ok({
    accessKey: result.accessKey,
    participant: { id: result.id, displayName: result.displayName },
  })
}
