/**
 * /join/[token] — public self-registration landing page.
 *
 * Pre-renders the form for a valid token, or 404s. The actual registration
 * still goes through POST /api/join/[token] — the server-side check here is
 * defense-in-depth so we don't render a form pointing at a dead token, but
 * the API is the source of truth for cap + stage gating.
 *
 * Reading from the DB makes this strictly per-request (see CLAUDE.md
 * "Conventions → Pages with force-dynamic").
 */

import { notFound } from 'next/navigation'

import { findSessionByJoinToken } from '@/db/repos/session'
import { JoinForm } from './join-form'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ token: string }> }

export default async function JoinPage({ params }: PageProps) {
  const { token } = await params
  const session = await findSessionByJoinToken(token)
  if (!session) notFound()

  return (
    <div className="flex flex-col gap-6">
      <JoinForm token={token} sessionTitle={session.title} stage={session.stage} />
    </div>
  )
}
