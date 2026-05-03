/**
 * POST /api/admin/participants/:id/regenerate — issue a fresh access key.
 *
 * Success: 200 { ok: true, data: { accessKey: string } }
 * Errors:  401 UNAUTHORIZED | 403 FORBIDDEN | 404 NOT_FOUND
 *
 * Replaces the participant's stored hash. The previous plaintext key fails
 * the next /api/auth/participant attempt with 401 INVALID_KEY.
 *
 * Note on stateless JWT: a participant who is currently logged in keeps a
 * valid cookie until expiry (24h) — JWTs are stateless by design, and this
 * endpoint does not revoke them. Admin intent in regenerating is "give them
 * a new key", not "kick them out now"; for an immediate kick-out, the admin
 * deletes and recreates the participant. Building a JWT denylist for one
 * niche flow would be overkill for a tool of this scale.
 */

import { err, ok } from '@/lib/api/responses'
import { requireAdmin } from '@/lib/auth/guards'
import { generateAccessKey, hashKey } from '@/lib/crypto'
import { updateParticipantKeyHash } from '@/db/repos/participant'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: RouteContext): Promise<Response> {
  try {
    const admin = await requireAdmin()
    const { id } = await ctx.params

    const accessKey = generateAccessKey()
    const accessKeyHash = hashKey(accessKey)

    const updated = await updateParticipantKeyHash(admin.sessionId, id, accessKeyHash)
    if (!updated) {
      return err('NOT_FOUND', 'Участник не найден', 404)
    }
    return ok({ accessKey })
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
