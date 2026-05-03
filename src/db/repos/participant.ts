/**
 * Participant repository helpers.
 *
 * Wraps Prisma access to keep route handlers free of ORM details. Public
 * shapes never include `accessKeyHash` — that field stays inside this module.
 */

import type { Participant, Prisma } from '@prisma/client'

import { prisma } from '@/db/client'

/**
 * Subset of PrismaClient methods used by the repo functions that may run
 * inside an externally-managed transaction. Accepting this type lets callers
 * pass either the top-level `prisma` client or a `tx` argument from
 * `prisma.$transaction(async (tx) => ...)` without changing the call site.
 */
type PrismaTxClient = Pick<Prisma.TransactionClient, 'participant'>
function client(tx?: PrismaTxClient) {
  return tx ?? prisma
}

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

export async function countParticipants(sessionId: string, tx?: PrismaTxClient): Promise<number> {
  return client(tx).participant.count({ where: { sessionId } })
}

/**
 * Public shape returned by the self-registration flow. Mirrors the data the
 * join page hands back to the new participant. We deliberately drop fields
 * that aren't useful client-side (createdAt, hasJoined) — the client only
 * needs `id` for follow-up calls and `displayName` for the post-registration
 * greeting.
 */
export type ParticipantSelfRegisteredPublic = {
  id: string
  displayName: string
}

/**
 * Self-register a participant via the public join page.
 *
 * Note on `hasJoined` semantics: `hasJoined` distinguishes "registered" from
 * "logged in". This call leaves it at the default `false` — the participant
 * has reserved a slot and received their key, but hasn't yet exchanged the
 * key for a session cookie. `markParticipantJoined` (invoked from
 * /api/auth/participant) flips it to `true` on first login.
 *
 * Throws on a UNIQUE collision on (sessionId, accessKeyHash). Caller wraps in
 * a small retry loop with a freshly generated key — the collision probability
 * per call is negligible (< 2^-40) but non-zero.
 */
export async function createParticipantSelfRegistered(
  params: {
    sessionId: string
    displayName: string
    accessKey: string
    accessKeyHash: string
  },
  tx?: PrismaTxClient,
): Promise<ParticipantSelfRegisteredPublic> {
  const created = await client(tx).participant.create({
    data: {
      sessionId: params.sessionId,
      displayName: params.displayName,
      accessKey: params.accessKey,
      accessKeyHash: params.accessKeyHash,
    },
  })
  // displayName is non-null because we always pass a string here. The DB
  // column is nullable for legacy reasons (admin-created participants without
  // a name) but self-registration requires a name.
  return { id: created.id, displayName: created.displayName ?? params.displayName }
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
