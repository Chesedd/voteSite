/**
 * In-memory failed-login rate limiter.
 *
 * Per docs/ARCHITECTURE.md "Rate limiting": after MAX_FAILURES failed attempts
 * within WINDOW_MS, block the offending key for LOCKOUT_MS. Sufficient for the
 * one-shot, small-group scope of this app — no Redis. State is per-process and
 * does not survive a restart, which is acceptable here.
 *
 * The `now` parameter on each function is a testability seam (defaults to
 * Date.now()) so unit tests can simulate window expiry / lockout expiry
 * without faking timers.
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
 * Returns null if the key is currently allowed to attempt login, or the
 * lockout-expires-at timestamp (ms) if the key is locked out.
 *
 * If a non-locked bucket is older than the failure window, it is treated as
 * expired and removed.
 */
export function checkLockout(key: string, now: number = Date.now()): number | null {
  const bucket = buckets.get(key)
  if (!bucket) return null

  if (bucket.lockedUntil !== null && bucket.lockedUntil > now) {
    return bucket.lockedUntil
  }

  if (bucket.lockedUntil !== null && bucket.lockedUntil <= now) {
    buckets.delete(key)
    return null
  }

  if (now - bucket.firstFailureAt >= WINDOW_MS) {
    buckets.delete(key)
    return null
  }

  return null
}

/**
 * Records a failed attempt for `key`. Returns the lockout-expires-at timestamp
 * if this attempt triggered a lockout, otherwise null.
 *
 * If the bucket is already locked, this call is a no-op (the lockout window
 * is not extended by extra attempts during lockout).
 */
export function recordFailure(key: string, now: number = Date.now()): number | null {
  const existing = buckets.get(key)

  if (existing && existing.lockedUntil !== null && existing.lockedUntil > now) {
    return existing.lockedUntil
  }

  // If the previous bucket aged out of the window, start fresh.
  if (existing && now - existing.firstFailureAt >= WINDOW_MS) {
    buckets.delete(key)
  }

  const bucket = buckets.get(key) ?? {
    failures: 0,
    lockedUntil: null,
    firstFailureAt: now,
  }
  bucket.failures += 1

  if (bucket.failures >= MAX_FAILURES) {
    bucket.lockedUntil = now + LOCKOUT_MS
    buckets.set(key, bucket)
    return bucket.lockedUntil
  }

  buckets.set(key, bucket)
  return null
}

/**
 * Clears all state for `key`. Call on a successful login so a user who
 * mistyped a few times before getting it right doesn't keep accumulating
 * toward a lockout.
 */
export function recordSuccess(key: string): void {
  buckets.delete(key)
}

/** Test-only helper. Resets all in-memory state. */
export function _resetAll(): void {
  buckets.clear()
}
