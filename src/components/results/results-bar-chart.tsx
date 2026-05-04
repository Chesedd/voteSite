/**
 * Horizontal bar chart for ranked TrackResult points.
 *
 * Shared between the admin results dashboard (`/admin/results`) and the
 * participant results page (`/results`). Recharts owns the rendering; this
 * component exists so both surfaces stay in visual lockstep — points axis,
 * tooltip styling, truncation rules.
 *
 * Client component because Recharts' `ResponsiveContainer` measures its host
 * after mount and doesn't run on the server.
 */

'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { TrackResult } from '@/lib/scoring'

const TITLE_TRUNCATE_LENGTH = 30

function truncate(value: string, max = TITLE_TRUNCATE_LENGTH): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}

export function ResultsBarChart({ results }: { results: TrackResult[] }) {
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
