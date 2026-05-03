import { redirect } from 'next/navigation'
import { getActiveSession } from '@/db/repos/session'
import { SetupForm } from './setup-form'

// Reads the DB to gate against re-running setup; must be per-request.
export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const session = await getActiveSession()
  if (session) redirect('/login')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Создание голосования</h1>
        <p className="text-muted-foreground text-sm">
          Это разовая настройка. Сохраните пароль администратора и ключи участников — без них
          восстановить доступ нельзя.
        </p>
      </div>
      <SetupForm />
    </div>
  )
}
