import { describe, expect, it } from 'vitest'

import { parseSessionSettings, sessionSettingsSchema } from './settings'

describe('parseSessionSettings', () => {
  it('returns {} for an empty object', () => {
    expect(parseSessionSettings({})).toEqual({})
  })

  it('returns {} for null/undefined (defaults via schema)', () => {
    expect(parseSessionSettings(null)).toEqual({})
    expect(parseSessionSettings(undefined)).toEqual({})
  })

  it('extracts revealResults when present and boolean', () => {
    expect(parseSessionSettings({ revealResults: true })).toEqual({ revealResults: true })
    expect(parseSessionSettings({ revealResults: false })).toEqual({ revealResults: false })
  })

  it('drops unknown keys silently', () => {
    expect(parseSessionSettings({ revealResults: true, foo: 'bar' })).toEqual({
      revealResults: true,
    })
  })

  it('falls back to {} when revealResults has the wrong type', () => {
    expect(parseSessionSettings({ revealResults: 'yes' })).toEqual({})
  })

  it('falls back to {} for non-object input (string, number, array)', () => {
    expect(parseSessionSettings('weird')).toEqual({})
    expect(parseSessionSettings(42)).toEqual({})
    expect(parseSessionSettings([1, 2, 3])).toEqual({})
  })

  it('schema is the source of truth and is reusable for direct parsing', () => {
    const result = sessionSettingsSchema.parse({ revealResults: true })
    expect(result.revealResults).toBe(true)
  })
})
