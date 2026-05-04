/**
 * Participant results view (TICKET-P7-04).
 *
 * Three states:
 *   - Allowed: ranked list + bar chart, podium emphasis on the top three.
 *   - Voting still in progress: "results will be available after voting ends".
 *   - Voting done but admin hasn't revealed: "wait for admin".
 *
 * Polls `/api/session` so the page reacts within ~5s when the admin flips the
 * reveal toggle either way (off → "wait for admin", on → renders results).
 * No matrix, no CSV — privacy. Admin keeps audit info on `/admin/results`.
 */

'use client'

import type { SessionStage } from '@prisma/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { ResultsBarChart } from '@/components/results/results-bar-chart'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TrackResult } from '@/lib/scoring'
import type { SessionSettings } from '@/lib/settings'
import { usePoll } from '@/lib/use-poll'
import { cn } from '@/lib/utils'

type SessionPoll = {
  stage: SessionStage
  settings: SessionSettings
}

type ResultsContentProps = {
  initialStage: SessionStage
  initialSettings: SessionSettings
  results: TrackResult[]
}

const PODIUM_EMOJI: Record<1 | 2 | 3, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function pluralizeVoters(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} голос`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} голоса`
  return `${n} голосов`
}

export function ParticipantResultsContent({
  initialStage,
  initialSettings,
  results,
}: ResultsContentProps) {
  const router = useRouter()

  // Poll the session to react when admin toggles reveal off (or stages back).
  // Server-rendered page is the source of truth for the data; this hook just
  // triggers a refresh when state changes underneath us.
  const polled = usePoll<SessionPoll>({
    url: '/api/session',
    initial: { stage: initialStage, settings: initialSettings },
    parser: async (res) => {
      const body = (await res.json()) as
        | { ok: true; data: { stage: SessionStage; settings: SessionSettings } }
        | { ok: false }
      if (!body.ok) throw new Error('session fetch failed')
      return { stage: body.data.stage, settings: body.data.settings }
    },
  })

  const stage = polled.stage
  const revealed = polled.settings.revealResults === true
  const initialRevealed = initialSettings.revealResults === true

  // When the polled state diverges from what the server rendered, re-run the
  // server component so the data + branch match the new state. Using an
  // effect (not a render-time call) keeps React happy.
  useEffect(() => {
    if (stage !== initialStage || revealed !== initialRevealed) {
      router.refresh()
    }
  }, [stage, revealed, initialStage, initialRevealed, router])

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Результаты голосования</h1>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/">К трекам</Link>
        </Button>
      </header>

      {stage !== 'FINISHED' ? (
        <Alert>
          <AlertTitle>Голосование ещё идёт</AlertTitle>
          <AlertDescription>
            Результаты появятся, когда админ закроет голосование и откроет их.
          </AlertDescription>
        </Alert>
      ) : !revealed ? (
        <Alert>
          <AlertTitle>Результаты пока скрыты</AlertTitle>
          <AlertDescription>
            Голосование завершено. Ждём, пока админ откроет результаты.
          </AlertDescription>
        </Alert>
      ) : results.length === 0 ? (
        <Alert>
          <AlertTitle>Результатов нет</AlertTitle>
          <AlertDescription>Никто так и не проголосовал.</AlertDescription>
        </Alert>
      ) : (
        <RevealedResults results={results} />
      )}
    </div>
  )
}

function RevealedResults({ results }: { results: TrackResult[] }) {
  const podium = results.slice(0, 3)
  const rest = results.slice(3)

  return (
    <div className="flex flex-col gap-6">
      {podium.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-3">
          {podium.map((r, idx) => {
            const place = (idx + 1) as 1 | 2 | 3
            return (
              <li key={r.trackId}>
                <PodiumCard rank={place} result={r} />
              </li>
            )
          })}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Очки по трекам</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultsBarChart results={results} />
        </CardContent>
      </Card>

      {rest.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Остальные места</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {rest.map((r, idx) => (
                <li
                  key={r.trackId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-2 last:border-b-0"
                >
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className="text-muted-foreground w-7 text-sm tabular-nums">
                      {idx + 4}.
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {r.artist ?? '—'}
                        {r.submittedBy.displayName ? ` · ${r.submittedBy.displayName}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {r.points} · {pluralizeVoters(r.voters)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PodiumCard({ rank, result }: { rank: 1 | 2 | 3; result: TrackResult }) {
  return (
    <Card
      className={cn(
        rank === 1 && 'border-primary/60 bg-primary/5',
        rank === 2 && 'border-foreground/20',
        rank === 3 && 'border-foreground/10',
      )}
    >
      <CardContent className="flex flex-col gap-2 py-5">
        <div className="flex items-center justify-between">
          <span aria-hidden="true" className={cn(rank === 1 ? 'text-4xl' : 'text-3xl')}>
            {PODIUM_EMOJI[rank]}
          </span>
          <span className="text-sm font-semibold tabular-nums">{result.points} оч.</span>
        </div>
        <p className={cn('font-semibold tracking-tight', rank === 1 ? 'text-lg' : 'text-base')}>
          {result.title}
        </p>
        <p className="text-muted-foreground text-sm">
          {result.artist ?? '—'}
          {result.submittedBy.displayName ? ` · ${result.submittedBy.displayName}` : ''}
        </p>
        <p className="text-muted-foreground text-xs">{pluralizeVoters(result.voters)}</p>
      </CardContent>
    </Card>
  )
}
