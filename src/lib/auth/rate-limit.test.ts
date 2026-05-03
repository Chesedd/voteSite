import { beforeEach, describe, expect, it } from 'vitest'
import { _resetAll, checkLockout, recordFailure, recordSuccess } from './rate-limit'

const WINDOW_MS = 5 * 60 * 1000
const LOCKOUT_MS = 5 * 60 * 1000
const MAX_FAILURES = 5

beforeEach(() => {
  _resetAll()
})

describe('checkLockout', () => {
  it('returns null for a fresh key with no recorded activity', () => {
    expect(checkLockout('1.2.3.4')).toBeNull()
  })

  it('still returns null after 4 failures (under threshold)', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      recordFailure('1.2.3.4', t0 + i)
    }
    expect(checkLockout('1.2.3.4', t0 + 100)).toBeNull()
  })
})

describe('recordFailure → lockout', () => {
  it('returns the lockoutUntil timestamp on the failure that crosses the threshold', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      expect(recordFailure('1.2.3.4', t0 + i)).toBeNull()
    }
    const lockoutAt = recordFailure('1.2.3.4', t0 + MAX_FAILURES)
    expect(lockoutAt).toBe(t0 + MAX_FAILURES + LOCKOUT_MS)
    // checkLockout reflects the same value.
    expect(checkLockout('1.2.3.4', t0 + MAX_FAILURES + 1)).toBe(t0 + MAX_FAILURES + LOCKOUT_MS)
  })

  it('does not extend an existing lockout on subsequent failures', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('1.2.3.4', t0 + i)
    const lockedUntil = checkLockout('1.2.3.4', t0 + MAX_FAILURES)
    expect(lockedUntil).not.toBeNull()

    // More failures while locked must not push the expiry further out.
    expect(recordFailure('1.2.3.4', t0 + MAX_FAILURES + 1000)).toBeNull()
    expect(recordFailure('1.2.3.4', t0 + MAX_FAILURES + 2000)).toBeNull()
    expect(checkLockout('1.2.3.4', t0 + MAX_FAILURES + 3000)).toBe(lockedUntil)
  })

  it('auto-resets after the lockout window passes', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('1.2.3.4', t0 + i)
    const lockedUntil = checkLockout('1.2.3.4', t0 + MAX_FAILURES)!
    expect(lockedUntil).not.toBeNull()

    expect(checkLockout('1.2.3.4', lockedUntil + 1)).toBeNull()
    // And a fresh failure starts the count over rather than re-locking.
    expect(recordFailure('1.2.3.4', lockedUntil + 100)).toBeNull()
  })
})

describe('recordSuccess', () => {
  it('clears accumulated failures so a single mistype does not stick', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('1.2.3.4', t0 + i)
    recordSuccess('1.2.3.4')

    // New failures after success must start at 1 — would have been failure #5
    // (lockout) without the clear, so this asserts the clear actually happened.
    expect(recordFailure('1.2.3.4', t0 + 1000)).toBeNull()
    expect(checkLockout('1.2.3.4', t0 + 2000)).toBeNull()
  })
})

describe('window expiry', () => {
  it('ages out old failures so they do not contribute to a later lockout', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('1.2.3.4', t0 + i)

    // Wait past the rolling window, then fail once more — should not lock.
    const later = t0 + WINDOW_MS + 1
    expect(recordFailure('1.2.3.4', later)).toBeNull()
    expect(checkLockout('1.2.3.4', later + 1)).toBeNull()
  })
})

describe('per-key isolation', () => {
  it('one key locking out does not affect a different key', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('1.2.3.4', t0 + i)
    expect(checkLockout('1.2.3.4', t0 + MAX_FAILURES)).not.toBeNull()
    expect(checkLockout('5.6.7.8', t0 + MAX_FAILURES)).toBeNull()
  })
})
