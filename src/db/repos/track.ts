/**
 * Track repository helpers.
 *
 * Wraps Prisma access for tracks. Keeps route handlers free of ORM details
 * and centralises the public shape returned to clients (no internal columns,
 * `submittedBy` joined as a nested `{ id, displayName }` object).
 *
 * Ownership: `updateTrack` and `deleteTrack` accept an `ownerId` argument.
 * When provided (participant flow) the mutation is scoped to rows where
 * `submittedById === ownerId`. When `null` (admin override on delete) any
 * row is touchable. Route handlers re-fetch the track to distinguish 404
 * from 403 — see `src/app/api/tracks/[id]/route.ts`.
 */

import type { Prisma } from '@prisma/client'

import { prisma } from '@/db/client'

export type TrackPublic = {
  id: string
  title: string
  artist: string | null
  url: string | null
  description: string | null
  service: string | null
  serviceTrackId: string | null
  serviceAlbumId: string | null
  coverUrl: string | null
  embedSupported: boolean
  submittedBy: { id: string; displayName: string | null }
  createdAt: Date
}

const trackInclude = {
  submittedBy: { select: { id: true, displayName: true } },
} as const satisfies Prisma.TrackInclude

type TrackWithSubmitter = Prisma.TrackGetPayload<{ include: typeof trackInclude }>

function toPublic(t: TrackWithSubmitter): TrackPublic {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    url: t.url,
    description: t.description,
    service: t.service,
    serviceTrackId: t.serviceTrackId,
    serviceAlbumId: t.serviceAlbumId,
    coverUrl: t.coverUrl,
    embedSupported: t.embedSupported,
    submittedBy: { id: t.submittedBy.id, displayName: t.submittedBy.displayName },
    createdAt: t.createdAt,
  }
}

export async function listTracks(sessionId: string): Promise<TrackPublic[]> {
  const rows = await prisma.track.findMany({
    where: { sessionId },
    include: trackInclude,
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toPublic)
}

export async function getTrack(id: string): Promise<TrackPublic | null> {
  const row = await prisma.track.findUnique({
    where: { id },
    include: trackInclude,
  })
  return row ? toPublic(row) : null
}

export async function createTrack(params: {
  sessionId: string
  submittedById: string
  title: string
  artist?: string | null
  url?: string | null
  description?: string | null
  service?: string | null
  serviceTrackId?: string | null
  serviceAlbumId?: string | null
  coverUrl?: string | null
  embedSupported?: boolean
}): Promise<TrackPublic> {
  const created = await prisma.track.create({
    data: {
      sessionId: params.sessionId,
      submittedById: params.submittedById,
      title: params.title,
      artist: params.artist ?? null,
      url: params.url ?? null,
      description: params.description ?? null,
      service: params.service ?? null,
      serviceTrackId: params.serviceTrackId ?? null,
      serviceAlbumId: params.serviceAlbumId ?? null,
      coverUrl: params.coverUrl ?? null,
      embedSupported: params.embedSupported ?? false,
    },
    include: trackInclude,
  })
  return toPublic(created)
}

/**
 * Updates a track scoped by ownership. Returns null when no row matches —
 * either the id is unknown or it belongs to a different participant. The
 * route handler distinguishes 404 vs 403 by re-fetching with `getTrack`.
 */
export async function updateTrack(
  id: string,
  ownerId: string,
  patch: Partial<{
    title: string
    artist: string | null
    url: string | null
    description: string | null
    service: string | null
    serviceTrackId: string | null
    serviceAlbumId: string | null
    coverUrl: string | null
    embedSupported: boolean
  }>,
): Promise<TrackPublic | null> {
  const result = await prisma.track.updateMany({
    where: { id, submittedById: ownerId },
    data: patch,
  })
  if (result.count === 0) return null
  const row = await prisma.track.findUnique({ where: { id }, include: trackInclude })
  return row ? toPublic(row) : null
}

/**
 * Deletes a track. When `ownerId` is provided (participant flow), the
 * delete is scoped to rows owned by that participant. When `ownerId` is
 * `null`, any row matching the id is removed (admin override). Cascades
 * to `Vote` rows via `onDelete: Cascade` in the Prisma schema.
 */
export async function deleteTrack(id: string, ownerId: string | null): Promise<boolean> {
  const where: Prisma.TrackWhereInput = ownerId ? { id, submittedById: ownerId } : { id }
  const result = await prisma.track.deleteMany({ where })
  return result.count > 0
}

export async function countTracksByParticipant(participantId: string): Promise<number> {
  return prisma.track.count({ where: { submittedById: participantId } })
}

/**
 * Aggregated stats for a session, used by the stage-transition endpoint to
 * verify prerequisites (`@/lib/stage-transitions.checkTransitionRequirements`).
 *
 * Prisma has no native distinct-count, so `distinctSubmittersCount` is derived
 * from a `findMany({ distinct })` length. All four queries run in parallel.
 */
export async function getStageStats(sessionId: string): Promise<{
  participantCount: number
  trackCount: number
  distinctSubmittersCount: number
  voteCount: number
}> {
  const [participantCount, trackCount, distinctSubmitters, voteCount] = await Promise.all([
    prisma.participant.count({ where: { sessionId } }),
    prisma.track.count({ where: { sessionId } }),
    prisma.track.findMany({
      where: { sessionId },
      select: { submittedById: true },
      distinct: ['submittedById'],
    }),
    prisma.vote.count({ where: { sessionId } }),
  ])
  return {
    participantCount,
    trackCount,
    distinctSubmittersCount: distinctSubmitters.length,
    voteCount,
  }
}
