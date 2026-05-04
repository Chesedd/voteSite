/**
 * CSV encoding helpers (TICKET-P7-02).
 *
 * Hand-rolled to avoid adding a CSV dep for a single endpoint. Quoting rules
 * follow RFC 4180: a field is quoted iff it contains a comma, double-quote,
 * CR, or LF; internal double-quotes are doubled. We always emit CRLF row
 * terminators since that's what spreadsheet apps (Excel, Numbers) expect on
 * .csv. The line separator on the wire is independent of the host OS.
 *
 * `formatResultsCsv` builds the full export payload: a ranked-results section
 * followed by a blank line and the voter matrix. Caller is responsible for
 * prepending the UTF-8 BOM (`﻿`) so Excel opens Cyrillic correctly —
 * keeping the BOM out of this pure function makes it easier to test.
 */

import type { TrackResult } from '@/lib/scoring'
import type { VoterRankMatrix } from '@/lib/results'

const CRLF = '\r\n'

export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'number' ? String(value) : value
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function encodeCsvRow(fields: Array<string | number | null | undefined>): string {
  return fields.map(escapeCsvField).join(',')
}

export function encodeCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map(encodeCsvRow).join(CRLF)
}

export function formatResultsCsv(params: {
  results: TrackResult[]
  matrix: VoterRankMatrix
}): string {
  const { results, matrix } = params

  const ranked: Array<Array<string | number | null | undefined>> = [
    [
      'Место',
      'Трек',
      'Артист',
      'Добавил',
      'Очки',
      'Голосовавших',
      'Голосов 1-го',
      'Голосов 2-го',
      'Голосов 3-го',
    ],
  ]
  results.forEach((r, idx) => {
    ranked.push([
      idx + 1,
      r.title,
      r.artist ?? '',
      r.submittedBy.displayName ?? '',
      r.points,
      r.voters,
      r.perRank[1],
      r.perRank[2],
      r.perRank[3],
    ])
  })

  const matrixSection: Array<Array<string | number | null | undefined>> = [
    [],
    ['Матрица голосов'],
    ['Трек', ...matrix.participants.map((p) => p.displayName ?? p.id)],
  ]
  for (const row of matrix.rows) {
    const cells: Array<string | number | null | undefined> = [row.title]
    for (const p of matrix.participants) {
      const rank = row.rankByParticipant[p.id]
      cells.push(rank ?? '')
    }
    matrixSection.push(cells)
  }

  return encodeCsv([...ranked, ...matrixSection])
}
