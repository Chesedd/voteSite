import { describe, expect, it } from 'vitest'

import { StageMismatchError, assertStage } from './stage'

describe('assertStage', () => {
  it('passes silently when the session stage matches', () => {
    expect(() => assertStage({ stage: 'STAGE1' }, 'STAGE1')).not.toThrow()
  })

  it('throws StageMismatchError when the session stage is not allowed', () => {
    expect(() => assertStage({ stage: 'STAGE2' }, 'STAGE1')).toThrow(StageMismatchError)
  })

  it('passes when the session stage is one of multiple allowed stages', () => {
    expect(() => assertStage({ stage: 'STAGE2' }, 'STAGE1', 'STAGE2')).not.toThrow()
    expect(() => assertStage({ stage: 'FINISHED' }, 'STAGE1', 'STAGE2')).toThrow(StageMismatchError)
  })

  it('error carries actual and allowed fields', () => {
    try {
      assertStage({ stage: 'FINISHED' }, 'STAGE1', 'STAGE2')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(StageMismatchError)
      const err = e as StageMismatchError
      expect(err.actual).toBe('FINISHED')
      expect(err.allowed).toEqual(['STAGE1', 'STAGE2'])
      expect(err.name).toBe('StageMismatchError')
    }
  })
})
