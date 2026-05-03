import { redirect } from 'next/navigation'

import { ParticipantsManager } from '@/components/admin/participants-manager'
import { listParticipants } from '@/db/repos/participant'
import { requireAdmin } from '@/lib/auth/guards'

export const dynamic = 'force-dynamic'

export default async function AdminParticipantsPage() {
  // Same try/catch reasoning as src/app/admin/layout.tsx — guards throw a
  // Response, which would surface as a 500 in a server component.
  try {
    await requireAdmin()
  } catch {
    redirect('/login')
  }

  const admin = await requireAdmin()
  const participants = await listParticipants(admin.sessionId)

  // Dates serialize across the server/client boundary as ISO strings; do it
  // explicitly so the client component owns a single shape.
  const initial = participants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    accessKey: p.accessKey,
    hasJoined: p.hasJoined,
    lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }))

  return <ParticipantsManager initialParticipants={initial} />
}
