import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AdminShell } from '@/components/admin/admin-shell'
import { getActiveSession } from '@/db/repos/session'
import { requireAdmin } from '@/lib/auth/guards'

// Reads cookie + DB on every request to gate access. Static prerender would
// either fail (no DATABASE_URL) or serve a stale shell to a logged-out user.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Админка · Голосование за песню',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Auth guards `throw` a Response, which route handlers convert to a real
  // HTTP response in their try/catch (see CLAUDE.md "Conventions"). Server
  // components don't have that conversion: an uncaught Response bubbles up
  // as an internal error. We catch it here and `redirect()` instead so an
  // unauthenticated visitor lands on /login rather than a 500 page.
  try {
    await requireAdmin()
  } catch {
    redirect('/login')
  }

  const session = await getActiveSession()
  if (!session) redirect('/setup')

  return <AdminShell session={session}>{children}</AdminShell>
}
