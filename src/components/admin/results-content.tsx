/**
 * /admin/results dashboard — chart + table + voter matrix + CSV export.
 *
 * The data comes pre-computed from `getResultsForSession` so this component
 * is thin presentation. Recharts owns the chart; everything else is plain
 * Tailwind tables and a Collapsible for the matrix. Empty/intermediate
 * stages get tailored copy (see "Empty/missing data handling" in the ticket).
 *
 * Why a client component: Recharts uses `ResponsiveContainer` + measure
 * effects that only work in the browser, and Collapsible owns local open
 * state.
 */

'use client'

import { useState } from 'react'
import { ChevronDownIcon, DownloadIcon } from 'lucide-react'
import type { SessionStage } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { ResultsBarChart } from '@/components/results/results-bar-chart'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ApiResponse } from '@/lib/api/responses'
import type { ResultsData } from '@/lib/results'
import type { SessionSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

type ResultsContentProps = {
  stage: SessionStage
  data: ResultsData
  settings: SessionSettings
}

function rankEmoji(rank: 1 | 2 | 3 | null): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return '—'
}

export function ResultsContent({ stage, data, settings }: ResultsContentProps) {
  const { results, matrix, meta } = data
  const hasVotes = meta.votingParticipants > 0
  const isStage1 = stage === 'STAGE1'

  return (
    <div className="flex flex-col gap-4">
      {/* Reveal toggle is meaningful only after voting closes — see */}
      {/* PATCH /api/admin/settings stage gate. Hide outside FINISHED. */}
      {stage === 'FINISHED' && <RevealToggleCard initial={settings.revealResults ?? false} />}

      <SummaryCard stage={stage} meta={meta} hasVotes={hasVotes} />

      {!isStage1 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Результаты</CardTitle>
            <Button asChild variant="outline" size="sm" disabled={results.length === 0}>
              <a href="/api/admin/results/export" download>
                <DownloadIcon className="mr-1 size-4" aria-hidden="true" />
                Скачать CSV
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            {hasVotes ? (
              <div className="flex flex-col gap-6">
                <ResultsBarChart results={results} />
                <ResultsTable results={results} />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Голосов пока нет. Дождитесь, пока участники проголосуют.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!isStage1 && hasVotes && <VoterMatrixCard matrix={matrix} />}
    </div>
  )
}

function RevealToggleCard({ initial }: { initial: boolean }) {
  const router = useRouter()
  const [revealed, setRevealed] = useState(initial)
  const [pending, setPending] = useState(false)

  async function toggle(next: boolean) {
    // Optimistic flip — revert on failure so the switch doesn't lie.
    setRevealed(next)
    setPending(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revealResults: next }),
      })
      const body = (await res.json()) as ApiResponse<{ settings: SessionSettings }>
      if (!body.ok) {
        throw new Error(body.error.message)
      }
      toast.success(next ? 'Результаты открыты участникам' : 'Результаты снова скрыты')
      router.refresh()
    } catch (e) {
      setRevealed(!next)
      const message = e instanceof Error ? e.message : 'Не удалось обновить настройки'
      toast.error(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Видимость результатов</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Label htmlFor="reveal-results-switch" className="text-sm font-medium">
            Показать результаты участникам
          </Label>
          <p className="text-muted-foreground text-sm">
            После включения участники увидят итоговый рейтинг треков. Изменения видны мгновенно.
          </p>
        </div>
        <Switch
          id="reveal-results-switch"
          checked={revealed}
          onCheckedChange={toggle}
          disabled={pending}
          aria-label="Показать результаты участникам"
        />
      </CardContent>
    </Card>
  )
}

function SummaryCard({
  stage,
  meta,
  hasVotes,
}: {
  stage: SessionStage
  meta: ResultsData['meta']
  hasVotes: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Сводка</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {stage === 'STAGE1' ? (
          <p className="text-muted-foreground text-sm">
            Голосование ещё не запустили. Результаты появятся после перехода на этап голосования.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Голосовало: <span className="font-medium">{meta.votingParticipants}</span> из{' '}
              <span className="font-medium">{meta.totalParticipants}</span> участников
            </p>
            {!hasVotes && stage === 'FINISHED' && (
              <p className="text-muted-foreground text-sm">Голосов не было.</p>
            )}
            {!hasVotes && stage === 'STAGE2' && (
              <p className="text-muted-foreground text-sm">
                Голосов пока нет. Дождитесь, пока участники проголосуют.
              </p>
            )}
            {stage !== 'FINISHED' && (
              <Alert>
                <AlertTitle>Промежуточные результаты</AlertTitle>
                <AlertDescription>Голосование ещё идёт.</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ResultsTable({ results }: { results: ResultsData['results'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs tracking-wide uppercase">
            <th className="px-2 py-2 font-medium">Место</th>
            <th className="px-2 py-2 font-medium">Трек</th>
            <th className="px-2 py-2 font-medium">Артист</th>
            <th className="px-2 py-2 font-medium">Добавил</th>
            <th className="px-2 py-2 text-right font-medium">Очки</th>
            <th className="px-2 py-2 text-right font-medium" aria-label="Голосов 1-го">
              🥇
            </th>
            <th className="px-2 py-2 text-right font-medium" aria-label="Голосов 2-го">
              🥈
            </th>
            <th className="px-2 py-2 text-right font-medium" aria-label="Голосов 3-го">
              🥉
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, idx) => (
            <tr key={r.trackId} className="border-b last:border-b-0">
              <td className="px-2 py-2 tabular-nums">{idx + 1}</td>
              <td className="px-2 py-2">{r.title}</td>
              <td className="text-muted-foreground px-2 py-2">{r.artist ?? '—'}</td>
              <td className="text-muted-foreground px-2 py-2">
                {r.submittedBy.displayName ?? '—'}
              </td>
              <td className="px-2 py-2 text-right font-medium tabular-nums">{r.points}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.perRank[1]}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.perRank[2]}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.perRank[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VoterMatrixCard({ matrix }: { matrix: ResultsData['matrix'] }) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="hover:text-foreground/80 flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={open}
            >
              <CardTitle>Кто за что голосовал</CardTitle>
              <ChevronDownIcon
                aria-hidden="true"
                className={cn('size-4 transition-transform', open && 'rotate-180')}
              />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <VoterMatrixTable matrix={matrix} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

function VoterMatrixTable({ matrix }: { matrix: ResultsData['matrix'] }) {
  if (matrix.participants.length === 0) {
    return <p className="text-muted-foreground text-sm">Нет участников.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs tracking-wide uppercase">
            <th className="px-2 py-2 font-medium">Трек</th>
            {matrix.participants.map((p) => (
              <th key={p.id} className="px-2 py-2 text-center font-medium">
                {p.displayName ?? '—'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.trackId} className="border-b last:border-b-0">
              <td className="px-2 py-2">{row.title}</td>
              {matrix.participants.map((p) => (
                <td key={p.id} className="px-2 py-2 text-center">
                  {rankEmoji(row.rankByParticipant[p.id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
