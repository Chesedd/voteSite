/**
 * /api/tracks/:id — edit and delete a single track.
 *
 * PATCH:  200 { ok: true, data: TrackPublic }
 *         errors: 400 INVALID_INPUT | 400 INVALID_STAGE | 401 UNAUTHORIZED |
 *                 403 OWNERSHIP_REQUIRED | 404 NOT_FOUND
 *
 * DELETE: 200 { ok: true }
 *         errors: 400 INVALID_STAGE | 401 UNAUTHORIZED |
 *                 403 OWNERSHIP_REQUIRED | 404 NOT_FOUND
 *
 * Ownership: participants can only mutate their own tracks. Admins can edit
 * or delete any track in any stage (used for moderation — deleting a
 * controversial submission late in STAGE2 or FINISHED is unusual but
 * allowed). The repo layer enforces ownership for participants by scoping
 * the SQL `WHERE` clause; route handlers re-fetch the track to distinguish
 * 404 (no such track) from 403 (track exists but isn't yours).
 *
 * Cascades: deleting a track removes its votes via `onDelete: Cascade` on
 * `Vote.trackId` (see prisma/schema.prisma).
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { getSessionUser } from '@/lib/auth/guards'
import { StageMismatchError, assertStage } from '@/lib/stage'
import { getActiveSession } from '@/db/repos/session'
import { deleteTrack, getTrack, updateTrack } from '@/db/repos/track'

const SERVICES = ['yandex', 'spotify', 'youtube', 'vk', 'apple', 'soundcloud', 'other'] as const

const TITLE_MAX = 120
const ARTIST_MAX = 120
const DESCRIPTION_MAX = 500
const SERVICE_TRACK_ID_MAX = 200

const optionalUrl = z
  .union([z.string().trim().url(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : v))

function optionalText(max: number) {
  return z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === '' || v == null ? null : v))
}

const PatchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    artist: optionalText(ARTIST_MAX),
    url: optionalUrl,
    description: optionalText(DESCRIPTION_MAX),
    service: z
      .union([z.enum(SERVICES), z.null()])
      .optional()
      .transform((v) => (v == null ? null : v)),
    serviceTrackId: z
      .union([z.string().trim().min(1).max(SERVICE_TRACK_ID_MAX), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v === '' || v == null ? null : v)),
    coverUrl: optionalUrl,
    embedSupported: z.boolean().optional(),
  })
  .strict()

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: RouteContext): Promise<Response> {
  try {
    const user = await getSessionUser()
    if (!user) return err('UNAUTHORIZED', 'Authentication required', 401)
    const { id } = await ctx.params

    const existing = await getTrack(id)
    if (!existing) {
      return err('NOT_FOUND', 'Трек не найден', 404)
    }

    if (user.kind === 'participant') {
      const session = await getActiveSession()
      if (!session) {
        return err('NOT_FOUND', 'Активная сессия не найдена', 404)
      }
      assertStage(session, 'STAGE1')
      if (existing.submittedBy.id !== user.participantId) {
        return err('OWNERSHIP_REQUIRED', 'Это не ваш трек', 403)
      }
    }

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

    // PATCH semantics: must touch at least one field.
    const provided = Object.keys(payload && typeof payload === 'object' ? payload : {})
    if (provided.length === 0) {
      return err('INVALID_INPUT', 'Нечего обновлять', 400)
    }

    // Only forward fields the client actually sent — `.optional()` produces
    // `undefined` for absent fields, but transforms also turn empty strings
    // into `null`, so we can't trust `undefined === absent` post-parse.
    const patch: Parameters<typeof updateTrack>[2] = {}
    const raw = payload as Record<string, unknown>
    if ('title' in raw) patch.title = parsed.data.title
    if ('artist' in raw) patch.artist = parsed.data.artist
    if ('url' in raw) patch.url = parsed.data.url
    if ('description' in raw) patch.description = parsed.data.description
    if ('service' in raw) patch.service = parsed.data.service
    if ('serviceTrackId' in raw) patch.serviceTrackId = parsed.data.serviceTrackId
    if ('coverUrl' in raw) patch.coverUrl = parsed.data.coverUrl
    if ('embedSupported' in raw && parsed.data.embedSupported !== undefined) {
      patch.embedSupported = parsed.data.embedSupported
    }

    // Admin override: pass the existing owner so the repo's ownership scope
    // matches and the row is updated. This avoids a separate "admin update"
    // path while keeping the participant flow strictly owner-scoped.
    const ownerForUpdate = user.kind === 'admin' ? existing.submittedBy.id : user.participantId
    const updated = await updateTrack(id, ownerForUpdate, patch)
    if (!updated) {
      // Race: track was deleted between getTrack and updateTrack.
      return err('NOT_FOUND', 'Трек не найден', 404)
    }
    return ok(updated)
  } catch (e) {
    if (e instanceof Response) return e
    if (e instanceof StageMismatchError) {
      return err('INVALID_STAGE', `Это действие недоступно на этапе ${e.actual}.`, 400)
    }
    throw e
  }
}

export async function DELETE(_req: Request, ctx: RouteContext): Promise<Response> {
  try {
    const user = await getSessionUser()
    if (!user) return err('UNAUTHORIZED', 'Authentication required', 401)
    const { id } = await ctx.params

    const existing = await getTrack(id)
    if (!existing) {
      return err('NOT_FOUND', 'Трек не найден', 404)
    }

    if (user.kind === 'participant') {
      const session = await getActiveSession()
      if (!session) {
        return err('NOT_FOUND', 'Активная сессия не найдена', 404)
      }
      assertStage(session, 'STAGE1')
      if (existing.submittedBy.id !== user.participantId) {
        return err('OWNERSHIP_REQUIRED', 'Это не ваш трек', 403)
      }
    }

    const ownerId = user.kind === 'admin' ? null : user.participantId
    const removed = await deleteTrack(id, ownerId)
    if (!removed) {
      return err('NOT_FOUND', 'Трек не найден', 404)
    }
    return ok(null)
  } catch (e) {
    if (e instanceof Response) return e
    if (e instanceof StageMismatchError) {
      return err('INVALID_STAGE', `Это действие недоступно на этапе ${e.actual}.`, 400)
    }
    throw e
  }
}
