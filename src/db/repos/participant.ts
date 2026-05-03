/**
 * Participant repository helpers.
 *
 * Minimal surface for now — only what the participant login endpoint needs.
 * Full repo helpers (createParticipants, listParticipants, etc.) will land in
 * their own ticket alongside the admin participants UI (ROADMAP P3-04).
 */

import { prisma } from '@/db/client'

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
