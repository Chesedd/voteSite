/**
 * /api/tracks — list pool, submit a track.
 *
 * GET:  200 { ok: true, data: TrackPublic[] }
 *       errors: 401 UNAUTHORIZED
 *       Visibility: any authenticated user (admin or participant) sees the
 *       full pool in any stage. See ARCHITECTURE.md "Visibility Matrix" —
 *       participants see other tracks both in STAGE1 (to discuss) and STAGE2
 *       (to vote on).
 *
 * POST: 200 { ok: true, data: TrackPublic }
 *       errors: 400 INVALID_INPUT | 400 INVALID_STAGE | 400 LIMIT_EXCEEDED |
 *               401 UNAUTHORIZED | 403 FORBIDDEN | 404 NOT_FOUND
 *
 * SERVER TRUSTS CLIENT METADATA: the client (P4-02 form) populates
 * `service`, `serviceTrackId`, `coverUrl`, and `embedSupported` from the
 * /api/tracks/preview endpoint (P4-04). The server re-validates basic
 * shapes (URL, enum, length) but does NOT re-fetch the URL to confirm
 * those fields are consistent with what URL parsing would actually
 * produce. Acceptable trade-off:
 *   - Track metadata is non-security-critical; worst case is a broken
 *     iframe render for one track on the requester's own client.
 *   - Server-side double-fetching adds latency for no security benefit.
 *   - The preview endpoint is the authoritative parser; the client is
 *     expected to use it (and will, in normal flows).
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { getSessionUser, requireParticipant } from '@/lib/auth/guards'
import { StageMismatchError, assertStage } from '@/lib/stage'
import { getActiveSession } from '@/db/repos/session'
import { countTracksByParticipant, createTrack, listTracks } from '@/db/repos/track'

const SERVICES = ['yandex', 'spotify', 'youtube', 'vk', 'apple', 'soundcloud', 'other'] as const

const TITLE_MAX = 120
const ARTIST_MAX = 120
const DESCRIPTION_MAX = 500
const SERVICE_TRACK_ID_MAX = 200
const TRACK_LIMIT = 3

// Empty string normalises to null on optional URL/text fields. This keeps the
// client form simple — it can submit `''` for unset fields without flipping
// inputs to undefined.
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

const optionalService = z
  .union([z.enum(SERVICES), z.null()])
  .optional()
  .transform((v) => (v == null ? null : v))

const PostBodySchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX),
    artist: optionalText(ARTIST_MAX),
    url: optionalUrl,
    description: optionalText(DESCRIPTION_MAX),
    service: optionalService,
    serviceTrackId: z
      .union([z.string().trim().min(1).max(SERVICE_TRACK_ID_MAX), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v === '' || v == null ? null : v)),
    coverUrl: optionalUrl,
    embedSupported: z.boolean().optional().default(false),
  })
  .strict()

export async function GET(): Promise<Response> {
  try {
    const user = await getSessionUser()
    if (!user) return err('UNAUTHORIZED', 'Authentication required', 401)
    const tracks = await listTracks(user.sessionId)
    return ok(tracks)
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const participant = await requireParticipant()

    const session = await getActiveSession()
    if (!session) {
      return err('NOT_FOUND', 'Активная сессия не найдена', 404)
    }
    assertStage(session, 'STAGE1')

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return err('INVALID_INPUT', 'Некорректный JSON в теле запроса', 400)
    }

    const parsed = PostBodySchema.safeParse(payload)
    if (!parsed.success) {
      return err('INVALID_INPUT', 'Проверьте введённые данные', 400)
    }

    const existing = await countTracksByParticipant(participant.participantId)
    if (existing >= TRACK_LIMIT) {
      return err(
        'LIMIT_EXCEEDED',
        `У вас уже ${TRACK_LIMIT} трека. Удалите один, чтобы добавить новый.`,
        400,
      )
    }

    const track = await createTrack({
      sessionId: session.id,
      submittedById: participant.participantId,
      title: parsed.data.title,
      artist: parsed.data.artist,
      url: parsed.data.url,
      description: parsed.data.description,
      service: parsed.data.service,
      serviceTrackId: parsed.data.serviceTrackId,
      coverUrl: parsed.data.coverUrl,
      embedSupported: parsed.data.embedSupported,
    })
    return ok(track)
  } catch (e) {
    if (e instanceof Response) return e
    if (e instanceof StageMismatchError) {
      return err('INVALID_STAGE', `Это действие недоступно на этапе ${e.actual}.`, 400)
    }
    throw e
  }
}
