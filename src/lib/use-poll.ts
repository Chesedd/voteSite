/**
 * Lightweight polling hooks for live updates (TICKET-P6-03).
 *
 * Two flavours:
 *   - `usePoll` — fetch a JSON endpoint on an interval, return the latest
 *     successful value. Used in the participant voting screen so a deleted
 *     track disappears within ~5s without manual refresh.
 *   - `useRouterRefreshPoll` — call `router.refresh()` on an interval. Used
 *     on admin pages where the data is server-rendered and re-deriving it on
 *     the client would mean shipping a duplicate fetch path. RSC refresh
 *     re-runs the page on the server with no UI flicker.
 *
 * Both hooks pause while `document.hidden` is true and resume the moment the
 * tab becomes visible again, so a tab left open in the background doesn't
 * burn requests.
 *
 * No WebSockets / SSE — see ARCHITECTURE.md "Polling vs realtime": 5s polling
 * is sufficient for ≤20 participants.
 *
 * Tests: deliberately none. The repo uses Vitest in `node` env, and React
 * hook assertions need `@testing-library/react` + jsdom which we don't pull
 * in for one helper. Behaviour is exercised by the integration in
 * `voting-home.tsx` / `admin-home-content.tsx`; the surface here is small
 * (visibility check, interval, parser) and type-checked at every call site.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { ApiResponse } from '@/lib/api/responses'

export const DEFAULT_POLL_INTERVAL_MS = 5000

type UsePollOptions<T> = {
  /** URL to fetch periodically. */
  url: string
  /** Interval in ms. Default 5000. */
  intervalMs?: number
  /** Initial value to use until the first fetch completes. */
  initial: T
  /** Map a fetch response to T. Default: response.json().data. */
  parser?: (response: Response) => Promise<T>
  /** Whether to start polling. Default true. */
  enabled?: boolean
}

async function defaultParser<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiResponse<T>
  if (!body.ok) {
    throw new Error(`API error: ${body.error.code}`)
  }
  return body.data
}

/**
 * Polls `url` and returns the latest successful response value.
 *
 * - First render: `initial` (no fetch yet).
 * - Each interval tick / visibility resume: fetch and (on success) update.
 * - Failures are silent: keep the last good value, log in dev only.
 */
export function usePoll<T>({
  url,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  initial,
  parser,
  enabled = true,
}: UsePollOptions<T>): T {
  const [value, setValue] = useState<T>(initial)

  // Refs so the interval handler reads the freshest props without rebinding.
  const urlRef = useRef(url)
  const enabledRef = useRef(enabled)
  const parserRef = useRef(parser)
  urlRef.current = url
  enabledRef.current = enabled
  parserRef.current = parser

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function fetchOnce(): Promise<void> {
      if (cancelled || !enabledRef.current) return
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const res = await fetch(urlRef.current, { cache: 'no-store' })
        if (!res.ok) return
        const next = parserRef.current ? await parserRef.current(res) : await defaultParser<T>(res)
        if (!cancelled) setValue(next)
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[usePoll] fetch failed', e)
        }
      }
    }

    void fetchOnce()
    const interval = window.setInterval(() => void fetchOnce(), intervalMs)

    function onVisibilityChange(): void {
      if (!document.hidden) void fetchOnce()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, intervalMs, url])

  return value
}

/**
 * Calls `router.refresh()` on an interval to re-run the current RSC page.
 *
 * Cheaper to wire up than `usePoll` when the page already renders everything
 * server-side and we only need fresh data — no fetch / parse / state to add.
 */
export function useRouterRefreshPoll(
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  enabled: boolean = true,
): void {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) router.refresh()
    }, intervalMs)
    return () => window.clearInterval(interval)
  }, [intervalMs, enabled, router])
}
