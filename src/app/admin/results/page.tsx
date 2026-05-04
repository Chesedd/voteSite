import { redirect } from 'next/navigation'

import { ResultsContent } from '@/components/admin/results-content'
import { getActiveSession } from '@/db/repos/session'
import { requireAdmin } from '@/lib/auth/guards'
import { getResultsForSession } from '@/lib/results'

export const dynamic = 'force-dynamic'

export default async function AdminResultsPage() {
  // Same try/catch reasoning as src/app/admin/layout.tsx — guards throw a
  // Response, which would surface as a 500 in a server component.
  try {
    await requireAdmin()
  } catch {
    redirect('/login')
  }

  const session = await getActiveSession()
  if (!session) redirect('/setup')

  const data = await getResultsForSession(session.id)
  return <ResultsContent stage={session.stage} data={data} />
}
