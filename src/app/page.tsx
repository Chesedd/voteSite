import { redirect } from 'next/navigation'

import { getActiveSession } from '@/db/repos/session'
import { getParticipantById } from '@/db/repos/participant'
import { getSessionUser } from '@/lib/auth/guards'
import { decideHomeRoute } from '@/lib/routing'

// Reads cookie + DB on every request. Must run per-request, not at build time.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const decision = await decideHomeRoute()
  if (decision.kind === 'redirect') redirect(decision.to)

  // decision.kind === 'render' && decision.as === 'participant'
  const [session, user] = await Promise.all([getActiveSession(), getSessionUser()])
  const participant =
    user?.kind === 'participant' ? await getParticipantById(user.participantId) : null

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Привет!</h1>
      <p className="text-muted-foreground text-sm">Этот экран будет заменён в следующей фазе.</p>
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt>Имя</dt>
        <dd className="text-foreground">{participant?.displayName ?? '—'}</dd>
        <dt>Этап</dt>
        <dd className="text-foreground">{session?.stage ?? '—'}</dd>
      </dl>
    </div>
  )
}
