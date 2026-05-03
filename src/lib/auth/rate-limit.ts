/**
 * In-memory rate limiter for failed-login lockout.
 *
 * Per ARCHITECTURE.md "Rate limiting": after 5 failed attempts in 5 minutes,
 * lock out the offending key (IP) for the next 5 minutes. Sufficient for our
 * one-shot, single-instance deployment — no Redis. State is process-local and
 * resets on restart, which is acceptable for the threat model.
 *
 * The `now` parameter on each function is for test injection — production
 * callers omit it and get `Date.now()` automatically.
 */

type Bucket = {
  failures: number
  lockedUntil: number | null
  firstFailureAt: number
}

const buckets = new Map<string, Bucket>()

const WINDOW_MS = 5 * 60 * 1000
const MAX_FAILURES = 5
const LOCKOUT_MS = 5 * 60 * 1000

/**
 * Returns null if the key is allowed to attempt a login. Returns the
 * lockout-expires-at timestamp (ms since epoch) if the key is currently
 * locked out.
 *
 * Side effect: if the rolling window has elapsed without a lockout, the
 * stale bucket is deleted so the next failure starts a fresh count.
 */
export function checkLockout(key: string, now: number = Date.now()): number | null {
  const bucket = buckets.get(key)
  if (!bucket) return null

  if (bucket.lockedUntil !== null && bucket.lockedUntil > now) {
    return bucket.lockedUntil
  }

  if (bucket.lockedUntil !== null && bucket.lockedUntil <= now) {
    // Lockout expired — clear and allow fresh attempts.
    buckets.delete(key)
    return null
  }

  if (now - bucket.firstFailureAt > WINDOW_MS) {
    // Failures aged out before MAX_FAILURES was reached — clear and allow.
    buckets.delete(key)
    return null
  }

  return null
}

/**
 * Records a failed attempt for the key. Returns the new lockout timestamp if
 * this failure crossed the threshold, or null otherwise.
 *
 * Once a bucket is locked, subsequent recordFailure calls are no-ops — the
 * lockout window doesn't extend on each new attempt.
 */
export function recordFailure(key: string, now: number = Date.now()): number | null {
  const existing = buckets.get(key)

  if (existing && existing.lockedUntil !== null && existing.lockedUntil > now) {
    // Already locked — don't extend the window or bump the counter.
    return null
  }

  if (!existing || now - existing.firstFailureAt > WINDOW_MS) {
    // Fresh bucket: either no prior failures, or the previous window aged out.
    buckets.set(key, {
      failures: 1,
      lockedUntil: null,
      firstFailureAt: now,
    })
    return null
  }

  existing.failures += 1
  if (existing.failures >= MAX_FAILURES) {
    existing.lockedUntil = now + LOCKOUT_MS
    return existing.lockedUntil
  }
  return null
}

/**
 * Clears all state for the key. Called on a successful login so that one
 * mistype followed by success doesn't accumulate toward a lockout.
 */
export function recordSuccess(key: string): void {
  buckets.delete(key)
}

/** Test-only helper: clear all buckets. */
export function _resetAll(): void {
  buckets.clear()
}
