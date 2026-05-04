import { describe, expect, it } from 'vitest'

import { encodeCsv, encodeCsvRow, escapeCsvField, formatResultsCsv } from './csv'
import type { TrackResult } from './scoring'
import type { VoterRankMatrix } from './results'

function trackResult(overrides: Partial<TrackResult> = {}): TrackResult {
  return {
    trackId: 't_1',
    title: 'Title',
    artist: null,
    submittedBy: { id: 'p_1', displayName: 'Аня' },
    points: 0,
    voters: 0,
    perRank: { 1: 0, 2: 0, 3: 0 },
    ...overrides,
  }
}

describe('escapeCsvField', () => {
  it('returns plain strings unquoted', () => {
    expect(escapeCsvField('hello')).toBe('hello')
  })

  it('renders null and undefined as empty strings', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('coerces numbers to strings without quoting', () => {
    expect(escapeCsvField(42)).toBe('42')
    expect(escapeCsvField(0)).toBe('0')
  })

  it('quotes fields containing a comma', () => {
    expect(escapeCsvField('a, b')).toBe('"a, b"')
  })

  it('quotes fields containing a newline', () => {
    expect(escapeCsvField('a\nb')).toBe('"a\nb"')
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"')
  })

  it('escapes internal double-quotes by doubling them', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
  })
})

describe('encodeCsvRow / encodeCsv', () => {
  it('joins fields with commas and rows with CRLF', () => {
    expect(encodeCsvRow(['a', 'b', 1])).toBe('a,b,1')
    expect(
      encodeCsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a,b\r\nc,d')
  })
})

describe('formatResultsCsv', () => {
  it('starts with the ranked header row and emits one row per result', () => {
    const csv = formatResultsCsv({
      results: [
        trackResult({
          trackId: 't_1',
          title: 'Alpha',
          artist: 'Artist A',
          submittedBy: { id: 'p_1', displayName: 'Аня' },
          points: 3,
          voters: 1,
          perRank: { 1: 1, 2: 0, 3: 0 },
        }),
      ],
      matrix: { participants: [], rows: [] },
    })
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'Место,Трек,Артист,Добавил,Очки,Голосовавших,Голосов 1-го,Голосов 2-го,Голосов 3-го',
    )
    expect(lines[1]).toBe('1,Alpha,Artist A,Аня,3,1,1,0,0')
  })

  it('properly escapes titles containing quotes and commas', () => {
    const csv = formatResultsCsv({
      results: [
        trackResult({
          trackId: 't_1',
          title: 'The "Best", Track',
          artist: 'Smith, J',
          submittedBy: { id: 'p_1', displayName: null },
          points: 3,
          voters: 1,
          perRank: { 1: 1, 2: 0, 3: 0 },
        }),
      ],
      matrix: { participants: [], rows: [] },
    })
    expect(csv).toContain('"The ""Best"", Track"')
    expect(csv).toContain('"Smith, J"')
  })

  it('appends a blank line, "Матрица голосов" header and the matrix table', () => {
    const matrix: VoterRankMatrix = {
      participants: [
        { id: 'p_1', displayName: 'Аня' },
        { id: 'p_2', displayName: null },
      ],
      rows: [
        {
          trackId: 't_1',
          title: 'Alpha',
          rankByParticipant: { p_1: 1, p_2: null },
        },
      ],
    }
    const csv = formatResultsCsv({
      results: [
        trackResult({
          trackId: 't_1',
          title: 'Alpha',
          points: 3,
          voters: 1,
          perRank: { 1: 1, 2: 0, 3: 0 },
        }),
      ],
      matrix,
    })
    const lines = csv.split('\r\n')
    // Header (1) + 1 result row + blank line + "Матрица голосов" + header row + 1 row.
    expect(lines).toContain('Матрица голосов')
    const matrixHeaderIdx = lines.indexOf('Матрица голосов')
    expect(lines[matrixHeaderIdx - 1]).toBe('')
    expect(lines[matrixHeaderIdx + 1]).toBe('Трек,Аня,p_2')
    expect(lines[matrixHeaderIdx + 2]).toBe('Alpha,1,')
  })
})
