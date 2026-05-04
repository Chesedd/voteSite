/**
 * Session settings (TICKET-P7-03 / P7-04).
 *
 * `Session.settings` is a JSONB column so we can grow per-session toggles
 * without a migration each time. The runtime shape is whatever Prisma hands
 * back — anything from `{}` (a fresh row) to a partial blob written by an
 * older version of the app — so every read goes through `parseSessionSettings`
 * which fills missing fields with their defaults.
 *
 * Keep this module the single source of truth for the shape: route handlers,
 * page components, and tests all import from here so that adding (e.g.) an
 * "anonymous mode" flag is a one-line change.
 */

import { z } from 'zod'

export const sessionSettingsSchema = z
  .object({
    revealResults: z.boolean().optional(),
  })
  .default({})

export type SessionSettings = z.infer<typeof sessionSettingsSchema>

/**
 * Coerce an unknown value (typically `Session.settings` straight from Prisma's
 * `JsonValue`) into a typed `SessionSettings`. Unknown keys are dropped, bad
 * values fall back to defaults — never throws, so callers can render even if a
 * row was written with a stale shape.
 */
export function parseSessionSettings(value: unknown): SessionSettings {
  const parsed = sessionSettingsSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}
