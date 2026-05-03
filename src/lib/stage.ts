/**
 * Stage gating helper.
 *
 * Every route handler that depends on the current SessionStage routes its
 * check through `assertStage` so the gate logic stays in one place. Inline
 * comparisons (`if (session.stage !== 'STAGE1')`) drift across endpoints —
 * see CLAUDE.md "Conventions → Stage gating".
 *
 * Callers wrap the handler body in a `try/catch` (per the standard auth-guard
 * pattern) and translate `StageMismatchError` to a 400 INVALID_STAGE response.
 */

import type { Session, SessionStage } from '@prisma/client'

export class StageMismatchError extends Error {
  constructor(
    public actual: SessionStage,
    public allowed: SessionStage[],
  ) {
    super(`Operation not allowed in stage ${actual} (allowed: ${allowed.join(', ')})`)
    this.name = 'StageMismatchError'
  }
}

/**
 * Throws `StageMismatchError` if `session.stage` is not in `allowed`.
 */
export function assertStage(session: Pick<Session, 'stage'>, ...allowed: SessionStage[]): void {
  if (!allowed.includes(session.stage)) {
    throw new StageMismatchError(session.stage, allowed)
  }
}
