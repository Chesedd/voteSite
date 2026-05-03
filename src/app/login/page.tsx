import { redirect } from 'next/navigation'
import { decideLoginRoute } from '@/lib/routing'
import { LoginForm } from './login-form'

// Reads the DB and request cookie on every request to decide whether to show
// the form or bounce to /setup or /. Must run per-request, not at build time.
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const decision = await decideLoginRoute()
  if (decision.kind === 'redirect') redirect(decision.to)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Вход</h1>
        <p className="text-muted-foreground text-sm">
          Используйте ключ от админа, либо войдите как администратор.
        </p>
      </div>
      <LoginForm />
    </div>
  )
}
