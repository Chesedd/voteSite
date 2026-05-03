/**
 * /api/admin/participants/:id — rename or delete a participant.
 *
 * PATCH: 200 { ok: true, data: { participant: ParticipantPublic } }
 *        errors: 400 INVALID_INPUT | 401 UNAUTHORIZED | 403 FORBIDDEN | 404 NOT_FOUND
 *
 * DELETE: 200 { ok: true }
 *         errors: 400 INVALID_INPUT (last participant) | 401 | 403 | 404 NOT_FOUND
 *
 * Deletion cascades to the participant's tracks and votes via Prisma's
 * `onDelete: Cascade` on Track.submittedBy and Vote.participantId — see
 * prisma/schema.prisma.
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { requireAdmin } from '@/lib/auth/guards'
import { countParticipants, deleteParticipant, renameParticipant } from '@/db/repos/participant'

const NAME_MAX = 40

const PatchBodySchema = z
  .object({
    // Either a non-empty string up to NAME_MAX (after trim) or explicit null
    // to clear. `undefined` rejected so the caller can't accidentally PATCH
    // an empty body.
    displayName: z.union([
      z
        .string()
        .trim()
        .min(1, 'Имя не может быть пустым')
        .max(NAME_MAX, `Имя должно быть не длиннее ${NAME_MAX} символов`),
      z.null(),
    ]),
  })
  .strict()

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: RouteContext): Promise<Response> {
  try {
    const admin = await requireAdmin()
    const { id } = await ctx.params

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return err('INVALID_INPUT', 'Некорректный JSON в теле запроса', 400)
    }

    const parsed = PatchBodySchema.safeParse(payload)
    if (!parsed.success) {
      return err('INVALID_INPUT', 'Проверьте введённые данные', 400)
    }

    const updated = await renameParticipant(admin.sessionId, id, parsed.data.displayName)
    if (!updated) {
      return err('NOT_FOUND', 'Участник не найден', 404)
    }
    return ok({ participant: updated })
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}

export async function DELETE(_req: Request, ctx: RouteContext): Promise<Response> {
  try {
    const admin = await requireAdmin()
    const { id } = await ctx.params

    // Refuse to remove the last participant: zero participants would break
    // stage transitions and several invariants downstream.
    const total = await countParticipants(admin.sessionId)
    if (total <= 1) {
      return err('INVALID_INPUT', 'Нельзя удалить последнего участника', 400)
    }

    const removed = await deleteParticipant(admin.sessionId, id)
    if (!removed) {
      return err('NOT_FOUND', 'Участник не найден', 404)
    }
    return ok(null)
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}
