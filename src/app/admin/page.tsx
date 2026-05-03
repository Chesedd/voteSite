import { redirect } from 'next/navigation'

import { AdminHomeContent } from '@/components/admin/admin-home-content'
import { getAdminOverview } from '@/db/repos/admin'
import { getActiveSession } from '@/db/repos/session'
import { requireAdmin } from '@/lib/auth/guards'

// Reads cookie + DB on every request. Static prerender is impossible.
export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  // Same try/catch reasoning as src/app/admin/layout.tsx — guards throw a
  // Response, which would surface as a 500 in a server component.
  try {
    await requireAdmin()
  } catch {
    redirect('/login')
  }

  const session = await getActiveSession()
  if (!session) redirect('/setup')

  const overview = await getAdminOverview(session.id)
  return <AdminHomeContent session={session} overview={overview} />
}
