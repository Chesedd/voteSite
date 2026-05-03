import { redirect } from 'next/navigation'
import { getActiveSession } from '@/db/repos/session'

// Hits the DB on every request to decide where to send the user, so it must
// run at request time rather than be prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getActiveSession()
  if (!session) redirect('/setup')
  redirect('/login')
}
