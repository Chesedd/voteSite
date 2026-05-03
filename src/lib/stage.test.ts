import { describe, expect, it } from 'vitest'

import { assertStage } from './stage'
import type { ApiError } from '@/lib/api/responses'

async function captureThrown(fn: () => unknown): Promise<Response> {
  try {
    fn()
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
  throw new Error('expected assertStage to throw a Response')
}

describe('assertStage', () => {
  it('returns silently when stage matches', () => {
    expect(() => assertStage({ stage: 'STAGE1' }, 'STAGE1')).not.toThrow()
  })

  it('returns silently when stage matches one of multiple allowed', () => {
    expect(() => assertStage({ stage: 'STAGE2' }, 'STAGE1', 'STAGE2')).not.toThrow()
  })

  it('throws a 400 INVALID_STAGE Response when stage does not match', async () => {
    const res = await captureThrown(() => assertStage({ stage: 'STAGE2' }, 'STAGE1'))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
  })

  it('throws when no allowed stages are passed', async () => {
    const res = await captureThrown(() => assertStage({ stage: 'STAGE1' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as ApiError
    expect(body.error.code).toBe('INVALID_STAGE')
  })
})
