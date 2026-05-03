/**
 * Participant repository helpers.
 *
 * Wraps Prisma access to keep route handlers free of ORM details. Public
 * shapes never include `accessKeyHash` — that field stays inside this module.
 */

import type { Participant } from '@prisma/client'

import { prisma } from '@/db/client'

/**
 * Public, sortable view of a Participant. Excludes `accessKeyHash` and
 * `sessionId` so callers can pass it straight through to API responses
 * without re-shaping. See ARCHITECTURE.md "API Endpoints → Participants".
 */
export type ParticipantPublic = {
  id: string
  displayName: string | null
  hasJoined: boolean
  lastSeenAt: Date | null
  createdAt: Date
}

function toPublic(p: Participant): ParticipantPublic {
  return {
    id: p.id,
    displayName: p.displayName,
    hasJoined: p.hasJoined,
    lastSeenAt: p.lastSeenAt,
    createdAt: p.createdAt,
  }
}

export async function findParticipantByKeyHash(sessionId: string, accessKeyHash: string) {
  return prisma.participant.findFirst({
    where: { sessionId, accessKeyHash },
  })
}

export async function getParticipantById(id: string) {
  return prisma.participant.findUnique({ where: { id } })
}

export async function markParticipantJoined(participantId: string, now: Date = new Date()) {
  return prisma.participant.update({
    where: { id: participantId },
    data: { hasJoined: true, lastSeenAt: now },
  })
}

export async function listParticipants(sessionId: string): Promise<ParticipantPublic[]> {
  const rows = await prisma.participant.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toPublic)
}

export async function countParticipants(sessionId: string): Promise<number> {
  return prisma.participant.count({ where: { sessionId } })
}

/**
 * Bulk-create participants with the given plaintext + hashed keys. Returned in
 * the same order as the input so callers can pair plaintext keys with
 * persisted rows. Caller is responsible for generating + hashing the keys; the
 * two values are stored together and never diverge (see ARCHITECTURE.md
 * "Data Model → Participant").
 */
export async function createParticipants(
  sessionId: string,
  participants: { accessKey: string; accessKeyHash: string }[],
): Promise<ParticipantPublic[]> {
  const created = await prisma.$transaction(
    participants.map((p) =>
      prisma.participant.create({
        data: { sessionId, accessKey: p.accessKey, accessKeyHash: p.accessKeyHash },
      }),
    ),
  )
  return created.map(toPublic)
}

/**
 * Rename a participant scoped to a session. Returns null if no row matches —
 * either the id is unknown or it belongs to a different session (which we
 * treat the same as not-found from the caller's perspective).
 */
export async function renameParticipant(
  sessionId: string,
  participantId: string,
  displayName: string | null,
): Promise<ParticipantPublic | null> {
  const result = await prisma.participant.updateMany({
    where: { id: participantId, sessionId },
    data: { displayName },
  })
  if (result.count === 0) return null
  const row = await prisma.participant.findUnique({ where: { id: participantId } })
  return row ? toPublic(row) : null
}

/**
 * Replace a participant's accessKey + accessKeyHash. Caller generates the new
 * plaintext key and computes its hash; both are written together so the
 * plaintext shown to admin always matches the hash used at login. Returns
 * null if no row matches.
 */
export async function updateParticipantKeyHash(
  sessionId: string,
  participantId: string,
  accessKey: string,
  accessKeyHash: string,
): Promise<ParticipantPublic | null> {
  const result = await prisma.participant.updateMany({
    where: { id: participantId, sessionId },
    data: { accessKey, accessKeyHash },
  })
  if (result.count === 0) return null
  const row = await prisma.participant.findUnique({ where: { id: participantId } })
  return row ? toPublic(row) : null
}

/**
 * Delete a participant scoped to a session. Cascades to their tracks and
 * votes via the Prisma schema (`onDelete: Cascade` on Track.submittedBy and
 * Vote.participantId). Returns true on delete, false if not found.
 */
export async function deleteParticipant(
  sessionId: string,
  participantId: string,
): Promise<boolean> {
  const result = await prisma.participant.deleteMany({
    where: { id: participantId, sessionId },
  })
  return result.count > 0
}
