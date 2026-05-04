import { redirect } from 'next/navigation'

import { ParticipantHome } from '@/components/participant/participant-home'
import { getActiveSession } from '@/db/repos/session'
import { listTracks } from '@/db/repos/track'
import { getVotesByRankForParticipant } from '@/db/repos/vote'
import { getSessionUser } from '@/lib/auth/guards'
import { decideHomeRoute } from '@/lib/routing'
import { parseSessionSettings } from '@/lib/settings'

// Reads cookie + DB on every request. Must run per-request, not at build time.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const decision = await decideHomeRoute()
  if (decision.kind === 'redirect') redirect(decision.to)

  // decideHomeRoute already covers the redirect cases above; the manual
  // re-checks below let TypeScript narrow `session` and `user` to non-null,
  // and guard against a race where state changed between the two reads.
  const session = await getActiveSession()
  const user = await getSessionUser()
  if (!session) redirect('/setup')
  if (!user || user.kind !== 'participant') redirect('/login')

  const tracks = await listTracks(session.id)
  const initialVotes =
    session.stage === 'STAGE2' ? await getVotesByRankForParticipant(user.participantId) : null

  return (
    <ParticipantHome
      sessionTitle={session.title}
      stage={session.stage}
      currentParticipantId={user.participantId}
      tracks={tracks}
      initialVotes={initialVotes}
      settings={parseSessionSettings(session.settings)}
    />
  )
}
