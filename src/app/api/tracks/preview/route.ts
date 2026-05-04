/**
 * POST /api/tracks/preview — preflight URL inspection for the track form.
 *
 * Body: { url: string } (1..500 chars)
 * Auth: participant
 * Stage: STAGE1 only
 *
 * Success: 200 { ok: true, data: {
 *   service: 'yandex' | 'spotify' | 'youtube' | 'vk' | 'apple' | 'soundcloud' | 'other' | null,
 *   serviceTrackId: string | null,
 *   embedSupported: boolean,
 *   suggestedTitle: string | null,
 *   suggestedArtist: string | null,
 *   coverUrl: string | null,
 * } }
 *
 * Errors: 400 INVALID_INPUT | 400 INVALID_STAGE | 401 UNAUTHORIZED | 403 FORBIDDEN |
 *         404 NOT_FOUND (active session missing)
 *
 * The endpoint never fails because OG metadata is missing — empty fields just
 * come back as null and the client decides what to do. Detection and metadata
 * fetch run in parallel; detection is sync but `Promise.all` keeps the surface
 * uniform if `detectService` ever grows I/O.
 *
 * Artist-extraction heuristic
 * ---------------------------
 * We scan `og:title` for an em-/en-/ASCII-dash separator (" — ", " – ", " - ")
 * — Yandex Music formats `og:title` as "{trackTitle} — {artist}", so when we
 * find a separator we treat the right-hand side as the artist and the
 * left-hand side as the title. If no separator is present we fall back to
 * `og:site_name` (which is brand-y on Spotify/YouTube but is the cheapest
 * fallback that doesn't require another HTTP roundtrip). Users can always
 * override the suggestion in the form before submitting — this is a hint,
 * not authoritative.
 */

import { z } from 'zod'

import { err, ok } from '@/lib/api/responses'
import { requireParticipant } from '@/lib/auth/guards'
import { StageMismatchError, assertStage } from '@/lib/stage'
import { detectService } from '@/lib/track-url'
import { fetchOgMetadata } from '@/lib/track-metadata'
import { getActiveSession } from '@/db/repos/session'

const URL_MAX = 500

const BodySchema = z.object({
  url: z.string().min(1).max(URL_MAX),
})

const TITLE_SEPARATORS = [' — ', ' – ', ' - ']

function splitTitleArtist(title: string | null): {
  suggestedTitle: string | null
  suggestedArtist: string | null
} {
  if (!title) return { suggestedTitle: null, suggestedArtist: null }
  for (const sep of TITLE_SEPARATORS) {
    const idx = title.indexOf(sep)
    if (idx > 0 && idx < title.length - sep.length) {
      const left = title.slice(0, idx).trim()
      const right = title.slice(idx + sep.length).trim()
      if (left.length > 0 && right.length > 0) {
        return { suggestedTitle: left, suggestedArtist: right }
      }
    }
  }
  return { suggestedTitle: title, suggestedArtist: null }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await requireParticipant()

    const session = await getActiveSession()
    if (!session) {
      return err('NOT_FOUND', 'Сессия не найдена', 404)
    }
    assertStage(session, 'STAGE1')

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return err('INVALID_INPUT', 'Некорректный JSON в теле запроса', 400)
    }

    const parsed = BodySchema.safeParse(payload)
    if (!parsed.success) {
      return err('INVALID_INPUT', 'URL должен быть строкой длиной от 1 до 500 символов', 400)
    }

    const { url } = parsed.data

    const [detection, metadata] = await Promise.all([
      Promise.resolve(detectService(url)),
      fetchOgMetadata(url),
    ])

    const service = detection?.service ?? null
    const serviceTrackId = detection?.serviceTrackId ?? null
    const embedSupported = detection?.embedSupported === true

    const split = splitTitleArtist(metadata.title)
    const suggestedTitle = split.suggestedTitle
    const suggestedArtist = split.suggestedArtist ?? metadata.siteName

    return ok({
      service,
      serviceTrackId,
      embedSupported,
      suggestedTitle,
      suggestedArtist,
      coverUrl: metadata.image,
    })
  } catch (e) {
    if (e instanceof Response) return e
    if (e instanceof StageMismatchError) {
      return err('INVALID_STAGE', `Это действие недоступно на этапе ${e.actual}.`, 400)
    }
    throw e
  }
}
