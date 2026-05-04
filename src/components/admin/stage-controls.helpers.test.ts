import { describe, expect, it } from 'vitest'

import { getButtonState } from './stage-controls.helpers'
import type { StageStats } from '@/lib/stage-transitions'

function stats(overrides: Partial<StageStats> = {}): StageStats {
  return {
    participantCount: 0,
    trackCount: 0,
    distinctSubmittersCount: 0,
    voteCount: 0,
    ...overrides,
  }
}

describe('getButtonState', () => {
  it('STAGE1 with sufficient tracks and submitters: enabled, no reasons', () => {
    const result = getButtonState('STAGE1', stats({ trackCount: 3, distinctSubmittersCount: 2 }))
    expect(result.primaryDisabled).toBe(false)
    expect(result.primaryReasons).toEqual([])
  })

  it('STAGE1 with too few tracks: disabled, reason mentions current count', () => {
    const result = getButtonState('STAGE1', stats({ trackCount: 2, distinctSubmittersCount: 2 }))
    expect(result.primaryDisabled).toBe(true)
    expect(result.primaryReasons).toHaveLength(1)
    expect(result.primaryReasons[0]).toContain('3 трека')
    expect(result.primaryReasons[0]).toContain('сейчас 2')
  })

  it('STAGE1 with too few distinct submitters: disabled, reason mentions current count', () => {
    const result = getButtonState('STAGE1', stats({ trackCount: 5, distinctSubmittersCount: 1 }))
    expect(result.primaryDisabled).toBe(true)
    expect(result.primaryReasons).toHaveLength(1)
    expect(result.primaryReasons[0]).toContain('2 участников')
    expect(result.primaryReasons[0]).toContain('сейчас 1')
  })

  it('STAGE1 with both insufficient: disabled, both reasons in order (tracks, submitters)', () => {
    const result = getButtonState('STAGE1', stats({ trackCount: 0, distinctSubmittersCount: 0 }))
    expect(result.primaryDisabled).toBe(true)
    expect(result.primaryReasons).toHaveLength(2)
    expect(result.primaryReasons[0]).toContain('трека')
    expect(result.primaryReasons[1]).toContain('участников')
  })

  it('STAGE2: always enabled, no reasons (no prerequisites for FINISHED)', () => {
    const result = getButtonState('STAGE2', stats())
    expect(result.primaryDisabled).toBe(false)
    expect(result.primaryReasons).toEqual([])
  })

  it('FINISHED: always enabled, no reasons (rollback has no prerequisites)', () => {
    const result = getButtonState('FINISHED', stats())
    expect(result.primaryDisabled).toBe(false)
    expect(result.primaryReasons).toEqual([])
  })
})
