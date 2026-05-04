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
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ResultsData } from '@/lib/results'
import { cn } from '@/lib/utils'

type ResultsContentProps = {
  stage: SessionStage
  data: ResultsData
}

const TITLE_TRUNCATE_LENGTH = 30

function truncate(value: string, max = TITLE_TRUNCATE_LENGTH): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}

function rankEmoji(rank: 1 | 2 | 3 | null): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return '—'
}

export function ResultsContent({ stage, data }: ResultsContentProps) {
  const { results, matrix, meta } = data
  const hasVotes = meta.votingParticipants > 0
  const isStage1 = stage === 'STAGE1'

  return (
    <div className="flex flex-col gap-4">
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
                <ResultsChart results={results} />
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

function ResultsChart({ results }: { results: ResultsData['results'] }) {
  const chartData = results.map((r) => ({
    title: truncate(r.title),
    fullTitle: r.title,
    points: r.points,
  }))
  const height = Math.max(160, chartData.length * 36 + 40)

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            allowDecimals={false}
            stroke="var(--muted-foreground)"
            fontSize={12}
          />
          <YAxis
            dataKey="title"
            type="category"
            width={140}
            stroke="var(--muted-foreground)"
            fontSize={12}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--popover-foreground)',
            }}
            formatter={(value) => [String(value), 'Очки']}
            labelFormatter={(_label, payload) => {
              const item = payload?.[0]?.payload as { fullTitle?: string } | undefined
              return item?.fullTitle ?? ''
            }}
          />
          <Bar dataKey="points" fill="var(--primary)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
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
