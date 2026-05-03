import { beforeEach, describe, expect, it } from 'vitest'
import { _resetAll, checkLockout, recordFailure, recordSuccess } from './rate-limit'

const WINDOW_MS = 5 * 60 * 1000
const LOCKOUT_MS = 5 * 60 * 1000

beforeEach(() => {
  _resetAll()
})

describe('rate-limit', () => {
  it('allows a fresh key', () => {
    expect(checkLockout('1.2.3.4')).toBeNull()
  })

  it('still allows after 4 failures within the window', () => {
    const t = 1_000_000
    for (let i = 0; i < 4; i++) {
      expect(recordFailure('ip', t + i)).toBeNull()
    }
    expect(checkLockout('ip', t + 5)).toBeNull()
  })

  it('locks out on the 5th failure and ignores further failures', () => {
    const t = 1_000_000
    for (let i = 0; i < 4; i++) recordFailure('ip', t + i)
    const lockoutUntil = recordFailure('ip', t + 4)
    expect(lockoutUntil).toBe(t + 4 + LOCKOUT_MS)

    // Subsequent failures during the lockout don't extend it.
    const stillSame = recordFailure('ip', t + 100)
    expect(stillSame).toBe(lockoutUntil)
    const stillSame2 = recordFailure('ip', t + 1000)
    expect(stillSame2).toBe(lockoutUntil)

    expect(checkLockout('ip', t + 5)).toBe(lockoutUntil)
  })

  it('auto-resets after the lockout window passes', () => {
    const t = 1_000_000
    for (let i = 0; i < 5; i++) recordFailure('ip', t + i)
    const lockoutUntil = t + 4 + LOCKOUT_MS

    expect(checkLockout('ip', lockoutUntil - 1)).toBe(lockoutUntil)
    expect(checkLockout('ip', lockoutUntil + 1)).toBeNull()
  })

  it('recordSuccess clears state even after several failures', () => {
    const t = 1_000_000
    for (let i = 0; i < 4; i++) recordFailure('ip', t + i)
    recordSuccess('ip')

    // Bucket forgot the failures: a single new failure should not lock out.
    expect(recordFailure('ip', t + 100)).toBeNull()
    expect(checkLockout('ip', t + 100)).toBeNull()
  })

  it('failures aged out of the window do not count', () => {
    const t = 1_000_000
    for (let i = 0; i < 4; i++) recordFailure('ip', t + i)

    // Wait past the window. The aged failures should be discarded; one more
    // failure leaves us at 1, not at 5.
    const later = t + WINDOW_MS + 1
    expect(recordFailure('ip', later)).toBeNull()
    expect(checkLockout('ip', later)).toBeNull()
  })
})
