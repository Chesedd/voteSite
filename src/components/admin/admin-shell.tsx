/**
 * Layout chrome shared by every /admin/* route.
 *
 * Header (full-width): session title + stage badge on the left, logout on the
 * right. Body: a sidebar with section links + a main panel for child routes.
 *
 * Client component because it needs `usePathname` for active-link detection
 * and `useRouter` for the post-logout navigation.
 */

'use client'

import type { Session } from '@prisma/client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { StageBadge } from '@/components/admin/stage-badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AdminShellProps = {
  session: Session
  children: React.ReactNode
}

type NavItem = {
  label: string
  href: string
  /** Use exact match for the root link, prefix match for nested sections. */
  match: 'exact' | 'prefix'
}

const NAV: ReadonlyArray<NavItem> = [
  { label: 'Обзор', href: '/admin', match: 'exact' },
  { label: 'Участники', href: '/admin/participants', match: 'prefix' },
  { label: 'Треки', href: '/admin/tracks', match: 'prefix' },
  { label: 'Голоса', href: '/admin/votes', match: 'prefix' },
  { label: 'Результаты', href: '/admin/results', match: 'prefix' },
]

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === 'exact') return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function AdminShell({ session, children }: AdminShellProps) {
  const pathname = usePathname() ?? '/admin'
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Best-effort: even if the network call fails, navigate to /login.
      // The cookie may still be set; the user can retry from there.
      toast.error('Не удалось связаться с сервером, выходим локально.')
    } finally {
      router.refresh()
      router.push('/login')
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{session.title}</h1>
          <StageBadge stage={session.stage} size="sm" />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut}
          className="self-start sm:self-auto"
        >
          {loggingOut ? 'Выходим…' : 'Выйти'}
        </Button>
      </header>
      <div className="flex flex-col gap-6 md:flex-row">
        <nav aria-label="Разделы админки" className="md:w-[200px] md:shrink-0">
          <ul className="flex flex-row flex-wrap gap-1 md:flex-col md:gap-0.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
