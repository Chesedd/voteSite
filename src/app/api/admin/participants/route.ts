/**
 * /api/admin/participants — list and bulk-create participants.
 *
 * GET:  200 { ok: true, data: ParticipantPublic[] }
 *       errors: 401 UNAUTHORIZED | 403 FORBIDDEN
 *
 * POST: 200 { ok: true, data: { accessKeys: string[] } }
 *       errors: 400 INVALID_INPUT | 400 LIMIT_EXCEEDED | 401 UNAUTHORIZED | 403 FORBIDDEN
 *
 * The POST response is the only place plaintext access keys are exposed for
 * newly-added participants — same one-shot UX as POST /api/setup. Hashes are
 * persisted; the plaintext exists only in the response body, then nowhere.
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { requireAdmin } from '@/lib/auth/guards'
import { generateAccessKey, hashKey } from '@/lib/crypto'
import { countParticipants, createParticipants, listParticipants } from '@/db/repos/participant'

const MIN_COUNT = 1
const MAX_BATCH = 30
const MAX_TOTAL = 30

const PostBodySchema = z
  .object({
    count: z.number().int().min(MIN_COUNT).max(MAX_BATCH),
  })
  .strict()

export async function GET(): Promise<Response> {
  try {
    const admin = await requireAdmin()
    const participants = await listParticipants(admin.sessionId)
    return ok(participants)
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const admin = await requireAdmin()

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return err('INVALID_INPUT', 'Некорректный JSON в теле запроса', 400)
    }

    const parsed = PostBodySchema.safeParse(payload)
    if (!parsed.success) {
      return err('INVALID_INPUT', `Число участников — целое от ${MIN_COUNT} до ${MAX_BATCH}.`, 400)
    }

    const { count } = parsed.data
    const existing = await countParticipants(admin.sessionId)
    if (existing + count > MAX_TOTAL) {
      return err('LIMIT_EXCEEDED', `В сессии может быть не больше ${MAX_TOTAL} участников.`, 400)
    }

    const accessKeys: string[] = []
    const hashes: string[] = []
    for (let i = 0; i < count; i++) {
      const key = generateAccessKey()
      accessKeys.push(key)
      hashes.push(hashKey(key))
    }

    await createParticipants(admin.sessionId, hashes)
    return ok({ accessKeys })
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
