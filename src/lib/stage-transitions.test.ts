import { describe, expect, it } from 'vitest'

import {
  canTransition,
  checkTransitionRequirements,
  describeTransitionRequirements,
  type StageStats,
} from './stage-transitions'

function stats(overrides: Partial<StageStats> = {}): StageStats {
  return {
    participantCount: 0,
    trackCount: 0,
    distinctSubmittersCount: 0,
    voteCount: 0,
    ...overrides,
  }
}

describe('canTransition', () => {
  it('allows STAGE1 → STAGE2', () => {
    expect(canTransition('STAGE1', 'STAGE2')).toBe(true)
  })

  it('allows STAGE2 → FINISHED', () => {
    expect(canTransition('STAGE2', 'FINISHED')).toBe(true)
  })

  it('allows STAGE2 → STAGE1 (rollback)', () => {
    expect(canTransition('STAGE2', 'STAGE1')).toBe(true)
  })

  it('allows FINISHED → STAGE2 (rollback)', () => {
    expect(canTransition('FINISHED', 'STAGE2')).toBe(true)
  })

  it('forbids STAGE1 → FINISHED (skip stage)', () => {
    expect(canTransition('STAGE1', 'FINISHED')).toBe(false)
  })

  it('forbids STAGE1 → STAGE1 (no-op)', () => {
    expect(canTransition('STAGE1', 'STAGE1')).toBe(false)
  })

  it('forbids FINISHED → STAGE1', () => {
    expect(canTransition('FINISHED', 'STAGE1')).toBe(false)
  })

  it('forbids FINISHED → FINISHED', () => {
    expect(canTransition('FINISHED', 'FINISHED')).toBe(false)
  })
})

describe('checkTransitionRequirements', () => {
  it('STAGE1 → STAGE2 with sufficient stats passes', () => {
    const result = checkTransitionRequirements(
      'STAGE1',
      'STAGE2',
      stats({ trackCount: 3, distinctSubmittersCount: 2 }),
    )
    expect(result.ok).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('STAGE1 → STAGE2 with 2 tracks reports tracks reason', () => {
    const result = checkTransitionRequirements(
      'STAGE1',
      'STAGE2',
      stats({ trackCount: 2, distinctSubmittersCount: 2 }),
    )
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('3 трека')
    expect(result.reasons[0]).toContain('сейчас 2')
  })

  it('STAGE1 → STAGE2 with 5 tracks all from one submitter reports submitters reason', () => {
    const result = checkTransitionRequirements(
      'STAGE1',
      'STAGE2',
      stats({ trackCount: 5, distinctSubmittersCount: 1 }),
    )
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('разных участников')
    expect(result.reasons[0]).toContain('1 автор')
  })

  it('STAGE1 → STAGE2 with both insufficient reports both reasons', () => {
    const result = checkTransitionRequirements(
      'STAGE1',
      'STAGE2',
      stats({ trackCount: 1, distinctSubmittersCount: 1 }),
    )
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(2)
    expect(result.reasons[0]).toContain('3 трека')
    expect(result.reasons[1]).toContain('разных участников')
  })

  it('STAGE2 → FINISHED with 0 votes is ok (no minimum)', () => {
    const result = checkTransitionRequirements(
      'STAGE2',
      'FINISHED',
      stats({ trackCount: 5, distinctSubmittersCount: 3, voteCount: 0 }),
    )
    expect(result.ok).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('rollback STAGE2 → STAGE1 always passes', () => {
    const result = checkTransitionRequirements('STAGE2', 'STAGE1', stats())
    expect(result.ok).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('rollback FINISHED → STAGE2 always passes', () => {
    const result = checkTransitionRequirements('FINISHED', 'STAGE2', stats())
    expect(result.ok).toBe(true)
    expect(result.reasons).toEqual([])
  })
})

describe('describeTransitionRequirements', () => {
  it('returns the two static requirements for STAGE1 → STAGE2', () => {
    expect(describeTransitionRequirements('STAGE1', 'STAGE2')).toEqual([
      'Нужно минимум 3 трека',
      'От минимум 2 участников',
    ])
  })

  it('returns [] for STAGE2 → FINISHED', () => {
    expect(describeTransitionRequirements('STAGE2', 'FINISHED')).toEqual([])
  })

  it('returns [] for rollbacks', () => {
    expect(describeTransitionRequirements('STAGE2', 'STAGE1')).toEqual([])
    expect(describeTransitionRequirements('FINISHED', 'STAGE2')).toEqual([])
  })
})
