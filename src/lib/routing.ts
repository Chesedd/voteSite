/**
 * Centralized routing decisions for `/` and `/login`.
 *
 * Both pages depend on the same two facts — does an active Session exist, and
 * is the current request authenticated — so the rules live here once. If
 * `/login` and `/` each rolled their own `if` chain, it would be too easy to
 * introduce an infinite redirect loop (e.g. `/` → `/login` → `/` → ...).
 */

import { getActiveSession } from '@/db/repos/session'
import { getSessionUser } from '@/lib/auth/guards'

export type RouteDecision =
  | { kind: 'redirect'; to: string }
  | { kind: 'render'; as: 'admin' | 'participant' }

/** Decides what should happen when a request lands on `/`. */
export async function decideHomeRoute(): Promise<RouteDecision> {
  const session = await getActiveSession()
  if (!session) return { kind: 'redirect', to: '/setup' }

  const user = await getSessionUser()
  if (!user) return { kind: 'redirect', to: '/login' }
  if (user.kind === 'admin') return { kind: 'redirect', to: '/admin' }
  return { kind: 'render', as: 'participant' }
}

/** Decides what should happen when a request lands on `/login`. */
export async function decideLoginRoute(): Promise<RouteDecision> {
  const session = await getActiveSession()
  if (!session) return { kind: 'redirect', to: '/setup' }

  const user = await getSessionUser()
  // Already logged in — bounce to `/` and let it route by user kind. This
  // keeps the "where do logged-in users go" rule in exactly one place.
  if (user) return { kind: 'redirect', to: '/' }
  return { kind: 'render', as: 'participant' }
}
